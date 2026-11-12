begin;
-- Write the locked request row on every proposal transition as well. This
-- makes concurrent completion/proposal transactions conflict under snapshot
-- isolation too, without changing quotation/progress request.version.
alter table public.tailoring_requests add column design_change_revision integer not null default 0 check(design_change_revision>=0);
create table public.design_change_proposals(
 id uuid primary key,request_id uuid not null references public.tailoring_requests(id),
 tailor_id uuid not null references auth.users(id),explanation text not null check(char_length(explanation) between 1 and 2000),
 images jsonb not null check(jsonb_typeof(images)='array' and jsonb_array_length(images) between 1 and 3),
 base_version integer not null check(base_version>=0),request_version integer not null,
 status text not null default 'pending' check(status in('pending','accepted','declined','withdrawn')),
 version integer not null default 1,created_at timestamptz not null default clock_timestamp(),
 decided_at timestamptz,decided_by uuid references auth.users(id),
 check((status='pending' and version=1 and decided_at is null and decided_by is null) or (status<>'pending' and version=2 and decided_at is not null and decided_by is not null))
);
create unique index one_pending_design_proposal on public.design_change_proposals(request_id) where status='pending';
create table public.request_agreed_designs(
 request_id uuid not null references public.tailoring_requests(id),version integer not null check(version>=0),
 proposal_id uuid unique references public.design_change_proposals(id),
 original_snapshot jsonb,images jsonb not null default '[]',explanation text not null default '',
 agreed_at timestamptz not null default clock_timestamp(),accepted_by uuid references auth.users(id),
 primary key(request_id,version),check((version=0 and proposal_id is null) or (version>0 and proposal_id is not null and accepted_by is not null))
);
alter table public.design_change_proposals enable row level security;
alter table public.request_agreed_designs enable row level security;
revoke all on public.design_change_proposals,public.request_agreed_designs from public,anon,authenticated;
grant select on public.design_change_proposals,public.request_agreed_designs to authenticated;
create policy proposal_participants on public.design_change_proposals for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create policy agreed_design_participants on public.request_agreed_designs for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
-- Reuse authenticated private chat-image uploads, previews and API cleanup.
-- A file belongs to either a message or a proposal, never both.
alter table public.chat_image_uploads add column proposal_id uuid references public.design_change_proposals(id);
alter table public.chat_image_uploads add constraint chat_or_proposal_file check(message_id is null or proposal_id is null);
create function public.protect_proposal_upload() returns trigger language plpgsql set search_path='' as $$
begin
 if old.proposal_id is not null and new is distinct from old then raise exception 'Submitted proposal files are immutable.' using errcode='22023';end if;
 return new;
end;$$;
create trigger protect_proposal_upload before update on public.chat_image_uploads for each row execute function public.protect_proposal_upload();
create or replace function public.chat_image_write_allowed(path text,meta jsonb) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,22));
 return public.valid_chat_upload_metadata(path,meta) and exists(select 1 from public.chat_image_uploads u join public.tailoring_requests r on r.id=u.request_id where u.owner_id=auth.uid() and auth.uid() in(r.customer_id,r.tailor_id) and r.status in('pending','accepted') and r.completed_at is null and u.image_path=path and u.message_id is null and u.proposal_id is null and not exists(select 1 from public.design_change_proposals p where p.id=u.draft_id));
end;$$;
create or replace function public.chat_image_read_allowed(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chat_image_uploads u join public.tailoring_requests r on r.id=u.request_id where u.image_path=path and auth.uid() in(r.customer_id,r.tailor_id) and (u.owner_id=auth.uid() or u.message_id is not null or u.proposal_id is not null))
$$;
create or replace function public.chat_image_delete_allowed(path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or path is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(path,22));
 return exists(select 1 from public.chat_image_uploads u where u.image_path=path and u.owner_id=auth.uid() and u.message_id is null and u.proposal_id is null);
end;$$;
create or replace function public.unused_chat_images(p_exclude_draft uuid default null) returns setof public.chat_image_uploads language sql security definer set search_path='' as $$
 select u.* from public.chat_image_uploads u where owner_id=auth.uid() and message_id is null and proposal_id is null and created_at<now()-interval '1 hour' and (p_exclude_draft is null or draft_id<>p_exclude_draft) order by created_at,id limit 100
$$;
-- release_chat_image already checks Storage absence. Explicitly block release
-- even if an operator has removed a submitted proposal object out of band.
create function public.protect_proposal_upload_delete() returns trigger language plpgsql set search_path='' as $$
begin if old.proposal_id is not null then raise exception 'Submitted proposal files are immutable.' using errcode='22023';end if;return old;end;$$;
create trigger protect_proposal_upload_delete before delete on public.chat_image_uploads for each row execute function public.protect_proposal_upload_delete();

alter table public.request_notifications add column proposal_id uuid references public.design_change_proposals(id);
alter table public.request_notifications drop constraint request_notifications_kind_check,drop constraint notification_event_shape;
alter table public.request_notifications add constraint request_notifications_kind_check check(kind in('two_days','due_today','quote_sent','quote_accepted','quote_declined','stage_changed','message_received','design_proposed','design_accepted','design_declined','design_withdrawn')),
add constraint notification_event_shape check(
 (kind in('two_days','due_today') and quote_id is null and revision is not null and confirmed_date is not null and progress_event_id is null and message_id is null and proposal_id is null)
 or (kind in('quote_sent','quote_accepted','quote_declined') and quote_id is not null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null and proposal_id is null)
 or (kind='stage_changed' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is not null and message_id is null and proposal_id is null)
 or (kind='message_received' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is not null and proposal_id is null)
 or (kind in('design_proposed','design_accepted','design_declined','design_withdrawn') and quote_id is null and revision is null and confirmed_date is null and progress_event_id is null and message_id is null and proposal_id is not null));
create unique index proposal_notification_once on public.request_notifications(proposal_id,kind) where proposal_id is not null;
create function public.preserve_proposal_notification() returns trigger language plpgsql set search_path='' as $$
begin if old.proposal_id is not null then new.invalidated_at:=old.invalidated_at;end if;return new;end;$$;
create trigger preserve_proposal_alert before update of invalidated_at on public.request_notifications for each row execute function public.preserve_proposal_notification();

create function public.propose_request_design(p_id uuid,p_request_id uuid,p_explanation text,p_images jsonb,p_expected_request_version integer,p_expected_design_version integer)
returns public.design_change_proposals language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;p public.design_change_proposals;u public.chat_image_uploads;item jsonb;files jsonb:='[]';ids jsonb;v integer;body text:=public.trim_request_message(p_explanation);
begin
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if auth.uid() is null or not found or r.tailor_id<>auth.uid() or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='tailor') then raise exception 'Only the addressed tailor can propose a design change.' using errcode='42501';end if;
 if p_id is null or body is null or char_length(body) not between 1 and 2000 or p_images is null or jsonb_typeof(p_images)<>'array' then raise exception 'Explain the change and choose 1 to 3 reference images.' using errcode='22023';end if;
 if jsonb_array_length(p_images) not between 1 and 3 then raise exception 'Choose 1 to 3 reference images.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_images) loop
  if jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid reference identifier.' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_images))<>jsonb_array_length(p_images) then raise exception 'Choose distinct references.' using errcode='22023';end if;
 select * into p from public.design_change_proposals where id=p_id;
 if found then
  select jsonb_agg(value->'id' order by ordinality) into ids from jsonb_array_elements(p.images) with ordinality;
  if p.request_id=r.id and p.tailor_id=auth.uid() and p.explanation=body and ids=p_images and p.base_version=p_expected_design_version and p.request_version=p_expected_request_version then return p;end if;
  raise exception 'Proposal identifier already used with different details.' using errcode='22023';
 end if;
 if r.status<>'accepted' or r.completed_at is not null then raise exception 'Proposals require an accepted incomplete request.' using errcode='22023';end if;
 if r.version is distinct from p_expected_request_version then raise exception 'Request changed. Refresh before proposing.' using errcode='40001';end if;
 select coalesce(max(version),0) into v from public.request_agreed_designs where request_id=r.id;
 if v is distinct from p_expected_design_version then raise exception 'Agreed design changed. Review it before proposing.' using errcode='40001';end if;
 if exists(select 1 from public.design_change_proposals where request_id=r.id and status='pending') then raise exception 'Resolve the pending design proposal first.' using errcode='22023';end if;
 if exists(select 1 from public.request_messages where id=p_id) then raise exception 'Use a separate proposal draft, not an ordinary chat message.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_images) loop
  select * into u from public.chat_image_uploads where id=(item#>>'{}')::uuid for update;
  if not found or u.owner_id<>auth.uid() or u.request_id<>r.id or u.draft_id<>p_id or u.message_id is not null or u.proposal_id is not null then raise exception 'Choose your own unused references from this proposal draft.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(u.image_path,22));
  perform 1 from storage.objects o where o.bucket_id='request-chat-images' and o.name=u.image_path and public.valid_reference_file(o.name,o.metadata) for share;
  if not found then raise exception 'Reference file missing or invalid. Retry its upload.' using errcode='22023';end if;
  files:=files||jsonb_build_array(jsonb_build_object('id',u.id,'image_path',u.image_path));
 end loop;
 insert into public.request_agreed_designs(request_id,version,original_snapshot)
 values(r.id,0,(select to_jsonb(s) from public.request_design_snapshots s where s.request_id=r.id)) on conflict do nothing;
 insert into public.design_change_proposals(id,request_id,tailor_id,explanation,images,base_version,request_version) values(p_id,r.id,auth.uid(),body,files,v,r.version) returning * into p;
 update public.chat_image_uploads set proposal_id=p.id where id in(select (value->>'id')::uuid from jsonb_array_elements(files));
 update public.tailoring_requests set design_change_revision=design_change_revision+1 where id=r.id;
 insert into public.request_notifications(recipient_id,request_id,kind,proposal_id) values(r.customer_id,r.id,'design_proposed',p.id);
 return p;
end;$$;

create function public.decide_request_design(p_id uuid,p_status text,p_expected_version integer,p_confirm boolean default false)
returns public.design_change_proposals language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;p public.design_change_proposals;v integer;
begin
 select * into r from public.tailoring_requests where id=(select request_id from public.design_change_proposals where id=p_id) for update;
 if auth.uid() is null or not found or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Proposal unavailable.' using errcode='42501';end if;
 select * into p from public.design_change_proposals where id=p_id for update;
 if p_status is null or p_status not in('accepted','declined','withdrawn') then raise exception 'Choose Accept, Decline or Withdraw.' using errcode='22023';end if;
 if (p_status='withdrawn' and auth.uid()<>r.tailor_id) or (p_status in('accepted','declined') and auth.uid()<>r.customer_id) then raise exception 'Only the customer can accept/decline; only the addressed tailor can withdraw.' using errcode='42501';end if;
 if p_status='accepted' and p_confirm is distinct from true then raise exception 'Explicitly confirm acceptance. Price and confirmed deadline do not change.' using errcode='22023';end if;
 if p.status=p_status and p.version=p_expected_version+1 and p.decided_by=auth.uid() then return p;end if;
 if p.status<>'pending' or p.version is distinct from p_expected_version then raise exception 'Proposal already decided or changed. Refresh its history.' using errcode='40001';end if;
 if r.status<>'accepted' or r.completed_at is not null then raise exception 'Proposal decisions require an accepted incomplete request.' using errcode='22023';end if;
 select coalesce(max(version),0) into v from public.request_agreed_designs where request_id=r.id;
 if v<>p.base_version then raise exception 'Agreed design changed. Refresh before deciding.' using errcode='40001';end if;
 update public.design_change_proposals set status=p_status,version=version+1,decided_at=clock_timestamp(),decided_by=auth.uid() where id=p.id returning * into p;
 if p_status='accepted' then
  insert into public.request_agreed_designs(request_id,version,proposal_id,images,explanation,accepted_by,agreed_at) values(r.id,v+1,p.id,p.images,p.explanation,auth.uid(),p.decided_at);
 end if;
 update public.tailoring_requests set design_change_revision=design_change_revision+1 where id=r.id;
 insert into public.request_notifications(recipient_id,request_id,kind,proposal_id) values(case when auth.uid()=r.customer_id then r.tailor_id else r.customer_id end,r.id,'design_'||case p_status when 'accepted' then 'accepted' when 'declined' then 'declined' else 'withdrawn' end,p.id);
 return p;
end;$$;

create function public.block_completion_pending_design() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.completed_at is null and new.completed_at is not null and exists(select 1 from public.design_change_proposals where request_id=old.id and status='pending') then raise exception 'Resolve the pending design proposal before completing this request.' using errcode='22023';end if;
 return new;
end;$$;
create trigger block_completion_pending_design before update of completed_at on public.tailoring_requests for each row execute function public.block_completion_pending_design();
revoke all on function public.protect_proposal_upload(),public.protect_proposal_upload_delete(),public.preserve_proposal_notification(),public.block_completion_pending_design(),public.propose_request_design(uuid,uuid,text,jsonb,integer,integer),public.decide_request_design(uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.propose_request_design(uuid,uuid,text,jsonb,integer,integer),public.decide_request_design(uuid,text,integer,boolean) to authenticated;
commit;
