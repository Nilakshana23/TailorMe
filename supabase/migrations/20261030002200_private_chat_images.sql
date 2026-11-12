begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('request-chat-images','request-chat-images',false,5242880,array['image/jpeg','image/png','image/webp']);
alter table public.request_messages add column images jsonb not null default '[]';
alter table public.request_messages drop constraint request_messages_body_check;
alter table public.request_messages add constraint message_content_check check(
 jsonb_typeof(images)='array' and jsonb_array_length(images)<=3 and char_length(body)<=2000
 and body=public.trim_request_message(body) and (char_length(body)>0 or jsonb_array_length(images)>0));
create table public.chat_image_uploads(
 id uuid primary key,owner_id uuid not null references auth.users(id),request_id uuid not null references public.tailoring_requests(id),
 draft_id uuid not null,image_path text not null unique,created_at timestamptz not null default clock_timestamp(),
 message_id uuid references public.request_messages(id),
 check(image_path ~ ('^'||owner_id::text||'/chat/'||request_id::text||'/'||draft_id::text||'/'||id::text||'\.(jpg|png|webp)$'))
);
create index chat_image_draft on public.chat_image_uploads(owner_id,draft_id);
alter table public.chat_image_uploads enable row level security;
revoke all on public.chat_image_uploads from public,anon,authenticated;
grant select on public.chat_image_uploads to authenticated;
create policy chat_upload_owner on public.chat_image_uploads for select to authenticated using(owner_id=auth.uid());

create function public.reserve_chat_image(p_id uuid,p_request_id uuid,p_draft_id uuid,p_extension text) returns public.chat_image_uploads language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;u public.chat_image_uploads;path text;
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
 if r.status not in('pending','accepted') or r.completed_at is not null then raise exception 'This conversation is read-only.' using errcode='22023';end if;
 if p_id is null or p_draft_id is null or p_extension is null or p_extension not in('jpg','png','webp') then raise exception 'Choose a JPEG, PNG or WebP image.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_draft_id::text,222));
 path:=auth.uid()::text||'/chat/'||r.id::text||'/'||p_draft_id::text||'/'||p_id::text||'.'||p_extension;
 select * into u from public.chat_image_uploads where id=p_id;
 if found then
  if u.owner_id=auth.uid() and u.image_path=path and u.message_id is null then return u;end if;
  raise exception 'Image identifier unavailable.' using errcode='22023';
 end if;
 if exists(select 1 from public.request_messages where id=p_draft_id) then raise exception 'Message already sent.' using errcode='22023';end if;
 if (select count(*) from public.chat_image_uploads where owner_id=auth.uid() and draft_id=p_draft_id)>=3 then raise exception 'Choose up to 3 images per message.' using errcode='22023';end if;
 insert into public.chat_image_uploads(id,owner_id,request_id,draft_id,image_path) values(p_id,auth.uid(),r.id,p_draft_id,path) returning * into u;return u;
end;$$;
create function public.chat_image_write_allowed(path text,meta jsonb) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,22));
 return public.valid_reference_file(path,meta) and exists(select 1 from public.chat_image_uploads u join public.tailoring_requests r on r.id=u.request_id where u.owner_id=auth.uid() and auth.uid() in(r.customer_id,r.tailor_id) and r.status in('pending','accepted') and r.completed_at is null and u.image_path=path and u.message_id is null);
end;$$;
create function public.chat_image_read_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_image_uploads u join public.tailoring_requests r on r.id=u.request_id where u.image_path=path and auth.uid() in(r.customer_id,r.tailor_id) and (u.owner_id=auth.uid() or u.message_id is not null))
$$;
create function public.chat_image_delete_allowed(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or path is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(path,22));
 return exists(select 1 from public.chat_image_uploads u where u.image_path=path and u.owner_id=auth.uid() and u.message_id is null);
end;$$;
create function public.chat_image_ready(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare u public.chat_image_uploads;
begin
 select * into u from public.chat_image_uploads where id=p_id and owner_id=auth.uid();
 if not found then raise exception 'Image unavailable.' using errcode='42501';end if;
 return exists(select 1 from storage.objects o where o.bucket_id='request-chat-images' and o.name=u.image_path and public.valid_reference_file(o.name,o.metadata));
end;$$;
create function public.release_chat_image(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u public.chat_image_uploads;
begin
 -- Same order as reservation/submission: request, upload, path.
 perform 1 from public.tailoring_requests where id=(select request_id from public.chat_image_uploads where id=p_id and owner_id=auth.uid()) for update;
 select * into u from public.chat_image_uploads where id=p_id and owner_id=auth.uid() for update;
 if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(u.image_path,22));
 if u.message_id is not null then raise exception 'Sent images are immutable.' using errcode='22023';end if;
 if exists(select 1 from storage.objects where bucket_id='request-chat-images' and name=u.image_path) then raise exception 'Remove the unused file through Storage first.' using errcode='22023';end if;
 delete from public.chat_image_uploads where id=u.id;
end;$$;
create function public.unused_chat_images(p_exclude_draft uuid default null) returns setof public.chat_image_uploads language sql security definer set search_path='' as $$
 select u.* from public.chat_image_uploads u where owner_id=auth.uid() and message_id is null and created_at<now()-interval '1 hour' and (p_exclude_draft is null or draft_id<>p_exclude_draft) order by created_at,id limit 100
$$;

create function public.send_request_image_message(p_id uuid,p_request_id uuid,p_body text,p_images jsonb) returns public.request_messages language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;m public.request_messages;u public.chat_image_uploads;item jsonb;normalized text;attachments jsonb:='[]';ids jsonb;next_sequence integer;
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Conversation unavailable.' using errcode='42501';end if;
 normalized:=public.trim_request_message(p_body);
 if p_id is null or normalized is null or char_length(normalized)>2000 or p_images is null or jsonb_typeof(p_images)<>'array' then raise exception 'Choose a caption up to 2,000 characters and up to 3 images.' using errcode='22023';end if;
 if jsonb_array_length(p_images)>3 or (normalized='' and jsonb_array_length(p_images)=0) then raise exception 'Enter text or choose up to 3 images.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_images) loop
  if jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unsupported image identifier.' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_images))<>jsonb_array_length(p_images) then raise exception 'Duplicate images are not allowed.' using errcode='22023';end if;
 select * into m from public.request_messages where id=p_id;
 if found then
  select coalesce(jsonb_agg(value->'id' order by ordinality),'[]') into ids from jsonb_array_elements(m.images) with ordinality;
  if m.request_id=p_request_id and m.sender_id=auth.uid() and m.body=normalized and ids=p_images then return m;end if;
  raise exception 'This message identifier was already used.' using errcode='22023';
 end if;
 if r.status not in('pending','accepted') or r.completed_at is not null then raise exception 'This conversation is read-only.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_images) loop
  select * into u from public.chat_image_uploads where id=(item#>>'{}')::uuid for update;
  if not found or u.owner_id<>auth.uid() or u.request_id<>r.id or u.draft_id<>p_id or u.message_id is not null then raise exception 'Choose your own images for this message and request.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(u.image_path,22));
  perform 1 from storage.objects o where o.bucket_id='request-chat-images' and o.name=u.image_path and public.valid_reference_file(o.name,o.metadata) for share;
  if not found then raise exception 'An image upload is missing or invalid. Retry it before sending.' using errcode='22023';end if;
  attachments:=attachments||jsonb_build_array(jsonb_build_object('id',u.id,'image_path',u.image_path));
 end loop;
 select coalesce(max(sequence),0)+1 into next_sequence from public.request_messages where request_id=r.id;
 insert into public.request_messages(id,request_id,sequence,sender_id,body,images) values(p_id,r.id,next_sequence,auth.uid(),normalized,attachments) returning * into m;
 update public.chat_image_uploads set message_id=m.id where id in(select (value->>'id')::uuid from jsonb_array_elements(attachments));
 insert into public.request_notifications(recipient_id,request_id,kind,message_id) values(case when auth.uid()=r.customer_id then r.tailor_id else r.customer_id end,r.id,'message_received',m.id);
 return m;
end;$$;
-- Old clients remain supported; they cannot retry an image message as text only.
create or replace function public.send_request_message(p_id uuid,p_request_id uuid,p_body text) returns public.request_messages language sql security definer set search_path='' as $$
 select public.send_request_image_message(p_id,p_request_id,p_body,'[]')
$$;

create policy chat_image_insert on storage.objects for insert to authenticated with check(bucket_id='request-chat-images' and public.chat_image_write_allowed(name,metadata));
create policy chat_image_read on storage.objects for select to authenticated using(bucket_id='request-chat-images' and public.chat_image_read_allowed(name));
create policy chat_image_delete on storage.objects for delete to authenticated using(bucket_id='request-chat-images' and public.chat_image_delete_allowed(name));
create policy chat_image_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(case when bucket_id<>'request-chat-images' then true when auth.uid() is null then false else public.chat_image_write_allowed(name,metadata) end);
create policy chat_image_read_guard on storage.objects as restrictive for select to anon,authenticated using(case when bucket_id<>'request-chat-images' then true when auth.uid() is null then false else public.chat_image_read_allowed(name) end);
create policy chat_image_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(case when bucket_id<>'request-chat-images' then true when auth.uid() is null then false else public.chat_image_delete_allowed(name) end);
create policy chat_image_no_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'request-chat-images') with check(bucket_id<>'request-chat-images');
revoke all on function public.reserve_chat_image(uuid,uuid,uuid,text),public.chat_image_write_allowed(text,jsonb),public.chat_image_read_allowed(text),public.chat_image_delete_allowed(text),public.chat_image_ready(uuid),public.release_chat_image(uuid),public.unused_chat_images(uuid),public.send_request_image_message(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_chat_image(uuid,uuid,uuid,text),public.chat_image_write_allowed(text,jsonb),public.chat_image_read_allowed(text),public.chat_image_delete_allowed(text),public.chat_image_ready(uuid),public.release_chat_image(uuid),public.unused_chat_images(uuid),public.send_request_image_message(uuid,uuid,text,jsonb) to authenticated;
commit;
