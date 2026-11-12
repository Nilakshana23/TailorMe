begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('request-reference-images','request-reference-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create table public.request_reference_uploads(
 id uuid primary key,owner_id uuid not null references auth.users(id),batch_id uuid not null,image_path text not null unique,
 created_at timestamptz not null default clock_timestamp(),submitted_request_id uuid references public.tailoring_requests(id),
 check(image_path ~ ('^'||owner_id::text||'/references/'||batch_id::text||'/'||id::text||'\.(jpg|png|webp)$'))
);
create index reference_upload_batch on public.request_reference_uploads(owner_id,batch_id);
alter table public.request_reference_uploads enable row level security;
revoke all on public.request_reference_uploads from public,anon,authenticated;
grant select on public.request_reference_uploads to authenticated;
create policy reference_upload_owner on public.request_reference_uploads for select to authenticated using(owner_id=auth.uid());
create table public.request_image_references(
 request_id uuid not null references public.tailoring_requests(id),ordinal integer not null check(ordinal between 1 and 5),
 upload_id uuid not null unique references public.request_reference_uploads(id),image_path text not null unique,
 note text not null default '' check(char_length(note)<=500),created_at timestamptz not null default clock_timestamp(),primary key(request_id,ordinal)
);
alter table public.request_image_references enable row level security;
revoke all on public.request_image_references from public,anon,authenticated;
grant select on public.request_image_references to authenticated;
create policy reference_request_participants on public.request_image_references for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));

create function public.valid_reference_file(path text,meta jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce((case when meta->>'size' ~ '^[0-9]{1,10}$' then (meta->>'size')::numeric between 1 and 5242880 else false end)
 and ((path ~ '\.jpg$' and meta->>'mimetype'='image/jpeg') or (path ~ '\.png$' and meta->>'mimetype'='image/png') or (path ~ '\.webp$' and meta->>'mimetype'='image/webp')),false)
$$;
create function public.reserve_request_reference(p_id uuid,p_batch_id uuid,p_extension text) returns public.request_reference_uploads language plpgsql security definer set search_path='' as $$
declare u public.request_reference_uploads;path text;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='customer' for update;
 if not found then raise exception 'Only customers can add request references.' using errcode='42501';end if;
 if p_id is null or p_batch_id is null or p_extension is null or p_extension not in('jpg','png','webp') then raise exception 'Choose a JPEG, PNG or WebP reference.' using errcode='22023';end if;
 path:=auth.uid()::text||'/references/'||p_batch_id::text||'/'||p_id::text||'.'||p_extension;
 select * into u from public.request_reference_uploads where id=p_id;
 if found then
  if u.owner_id=auth.uid() and u.image_path=path and u.submitted_request_id is null then return u;end if;
  raise exception 'Reference identifier unavailable.' using errcode='22023';
 end if;
 if (select count(*) from public.request_reference_uploads where owner_id=auth.uid() and batch_id=p_batch_id)>=5 then raise exception 'A request can have up to 5 reference images. Remove an unused image first.' using errcode='22023';end if;
 insert into public.request_reference_uploads(id,owner_id,batch_id,image_path) values(p_id,auth.uid(),p_batch_id,path) returning * into u;return u;
end;$$;
create function public.reference_upload_allowed(path text,meta jsonb) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,21));
 return public.valid_reference_file(path,meta) and exists(select 1 from public.request_reference_uploads u join public.user_roles r on r.user_id=u.owner_id where u.owner_id=auth.uid() and r.role='customer' and u.image_path=path and u.submitted_request_id is null);
end;$$;
create function public.reference_read_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from public.request_reference_uploads u where u.owner_id=auth.uid() and u.image_path=path)
 or exists(select 1 from public.request_image_references f join public.tailoring_requests r on r.id=f.request_id where f.image_path=path and auth.uid() in(r.customer_id,r.tailor_id)))
$$;
create function public.reference_delete_allowed(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or path is null or path !~ ('^'||auth.uid()::text||'/references/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(path,21));
 return not exists(select 1 from public.request_image_references where image_path=path);
end;$$;
create function public.request_reference_ready(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare u public.request_reference_uploads;
begin
 select * into u from public.request_reference_uploads where id=p_id and owner_id=auth.uid();
 if not found then raise exception 'Reference unavailable.' using errcode='42501';end if;
 return exists(select 1 from storage.objects o where o.bucket_id='request-reference-images' and o.name=u.image_path and public.valid_reference_file(o.name,o.metadata));
end;$$;
create function public.release_request_reference(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u public.request_reference_uploads;
begin
 perform 1 from public.user_roles where user_id=auth.uid() for update;
 select * into u from public.request_reference_uploads where id=p_id and owner_id=auth.uid() for update;
 if not found then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(u.image_path,21));
 if u.submitted_request_id is not null or exists(select 1 from public.request_image_references where upload_id=u.id) then raise exception 'Submitted references are immutable.' using errcode='22023';end if;
 if exists(select 1 from storage.objects where bucket_id='request-reference-images' and name=u.image_path) then raise exception 'Remove the unused file through Storage before releasing its slot.' using errcode='22023';end if;
 delete from public.request_reference_uploads where id=u.id;
end;$$;
create function public.unused_request_reference_uploads(p_exclude_batch uuid default null) returns setof public.request_reference_uploads language sql security definer set search_path='' as $$
 select u.* from public.request_reference_uploads u where u.owner_id=auth.uid() and u.submitted_request_id is null and u.created_at<now()-interval '1 hour' and (p_exclude_batch is null or u.batch_id<>p_exclude_batch) order by u.created_at,u.id limit 100
$$;

create function public.send_tailoring_request_with_references(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_share boolean,p_values jsonb,p_measured_on date,p_references jsonb,p_reference_batch uuid,p_design_id uuid default null,p_design_version integer default null)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;u public.request_reference_uploads;item jsonb;normalized jsonb:='[]';saved jsonb;position integer:=0;existing boolean;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='customer' for update;
 if not found then raise exception 'Only customers can send requests.' using errcode='42501';end if;
 if p_references is null or jsonb_typeof(p_references)<>'array' then raise exception 'Choose supported image references.' using errcode='22023';end if;
 if jsonb_array_length(p_references)>5 or (jsonb_array_length(p_references)>0 and p_reference_batch is null) then raise exception 'Choose up to 5 images from this request draft.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_references) loop
  if jsonb_typeof(item)<>'object' or (item-array['id','note'])<>'{}'::jsonb or jsonb_typeof(item->'id') is distinct from 'string' or item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or (item ? 'note' and jsonb_typeof(item->'note')<>'string') or char_length(coalesce(item->>'note',''))>500 then raise exception 'Invalid image reference or note (maximum 500 characters).' using errcode='22023';end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('id',item->>'id','note',btrim(coalesce(item->>'note',''))));
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(normalized))<>jsonb_array_length(normalized) then raise exception 'Do not attach the same image twice.' using errcode='22023';end if;
 select * into r from public.tailoring_requests where id=p_id;existing:=found;
 if existing then
  if r.customer_id<>auth.uid() then raise exception 'Request unavailable.' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.upload_id,'note',f.note) order by f.ordinal),'[]') into saved from public.request_image_references f where request_id=p_id;
  if saved<>normalized or exists(select 1 from public.request_image_references f join public.request_reference_uploads x on x.id=f.upload_id where f.request_id=p_id and x.batch_id is distinct from p_reference_batch) then raise exception 'Submission references differ. Open the saved request.' using errcode='22023';end if;
 else
  for item in select value from jsonb_array_elements(normalized) loop
   select * into u from public.request_reference_uploads where id=(item->>'id')::uuid for update;
   if not found or u.owner_id<>auth.uid() or u.batch_id is distinct from p_reference_batch or u.submitted_request_id is not null then raise exception 'Choose your own unused reference uploads.' using errcode='42501';end if;
   perform pg_advisory_xact_lock(hashtextextended(u.image_path,21));
   perform 1 from storage.objects o where o.bucket_id='request-reference-images' and o.name=u.image_path and public.valid_reference_file(o.name,o.metadata) for share;
   if not found then raise exception 'A reference upload is missing or invalid. Retry the upload or remove it before submitting.' using errcode='22023';end if;
  end loop;
 end if;
 r:=public.send_tailoring_request_with_measurements(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date,p_share,p_values,p_measured_on,p_design_id,p_design_version);
 if not existing then
  for item in select value from jsonb_array_elements(normalized) loop
   position:=position+1;
   select * into u from public.request_reference_uploads where id=(item->>'id')::uuid;
   insert into public.request_image_references(request_id,ordinal,upload_id,image_path,note) values(r.id,position,u.id,u.image_path,item->>'note');
   update public.request_reference_uploads set submitted_request_id=r.id where id=u.id;
  end loop;
 end if;
 return r;
end;$$;

create policy reference_file_insert on storage.objects for insert to authenticated with check(bucket_id='request-reference-images' and public.reference_upload_allowed(name,metadata));
create policy reference_file_read on storage.objects for select to authenticated using(bucket_id='request-reference-images' and public.reference_read_allowed(name));
create policy reference_file_delete on storage.objects for delete to authenticated using(bucket_id='request-reference-images' and public.reference_delete_allowed(name));
create policy reference_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(case when bucket_id<>'request-reference-images' then true when auth.uid() is null then false else public.reference_upload_allowed(name,metadata) end);
create policy reference_read_guard on storage.objects as restrictive for select to anon,authenticated using(case when bucket_id<>'request-reference-images' then true when auth.uid() is null then false else public.reference_read_allowed(name) end);
create policy reference_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(case when bucket_id<>'request-reference-images' then true when auth.uid() is null then false else public.reference_delete_allowed(name) end);
create policy reference_no_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'request-reference-images') with check(bucket_id<>'request-reference-images');
revoke all on function public.valid_reference_file(text,jsonb),public.reserve_request_reference(uuid,uuid,text),public.reference_upload_allowed(text,jsonb),public.reference_read_allowed(text),public.reference_delete_allowed(text),public.request_reference_ready(uuid),public.release_request_reference(uuid),public.unused_request_reference_uploads(uuid),public.send_tailoring_request_with_references(uuid,uuid,text,text,integer,date,boolean,jsonb,date,jsonb,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.valid_reference_file(text,jsonb),public.reserve_request_reference(uuid,uuid,text),public.reference_upload_allowed(text,jsonb),public.reference_read_allowed(text),public.reference_delete_allowed(text),public.request_reference_ready(uuid),public.release_request_reference(uuid),public.unused_request_reference_uploads(uuid),public.send_tailoring_request_with_references(uuid,uuid,text,text,integer,date,boolean,jsonb,date,jsonb,uuid,uuid,integer) to authenticated;
commit;
