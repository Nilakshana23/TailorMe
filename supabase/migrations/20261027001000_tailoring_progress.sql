begin;
alter table public.tailoring_requests add column progress_stage text check(progress_stage in('confirmed','designing','stitching','fitting','ready'));
alter table public.tailoring_requests add column work_stage text generated always as(case when completed_at is not null then 'completed' else progress_stage end) stored;
create table public.request_progress_history (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.tailoring_requests(id),
 from_stage text,to_stage text not null check(to_stage in('confirmed','designing','stitching','fitting','ready','completed')),
 request_version integer not null,actor_id uuid not null references auth.users(id),changed_at timestamptz not null default now(),
 note text not null default '' check(char_length(note)<=1000),unique(request_id,request_version),unique(request_id,to_stage)
);
alter table public.request_progress_history enable row level security;
revoke all on public.request_progress_history from public,anon,authenticated;
grant select on public.request_progress_history to authenticated;
create policy progress_participants on public.request_progress_history for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
alter table public.request_notifications add column progress_event_id uuid references public.request_progress_history(id);
alter table public.request_notifications drop constraint request_notifications_kind_check;
alter table public.request_notifications add constraint request_notifications_kind_check check(kind in('two_days','due_today','quote_sent','quote_accepted','quote_declined','stage_changed'));
alter table public.request_notifications drop constraint notification_event_shape;
alter table public.request_notifications add constraint notification_event_shape check(
 (kind in('two_days','due_today') and quote_id is null and revision is not null and confirmed_date is not null and progress_event_id is null)
 or (kind in('quote_sent','quote_accepted','quote_declined') and quote_id is not null and revision is null and confirmed_date is null and progress_event_id is null)
 or (kind='stage_changed' and quote_id is null and revision is null and confirmed_date is null and progress_event_id is not null));
create unique index progress_notification_once on public.request_notifications(progress_event_id) where progress_event_id is not null;
-- Preserve the existing implementation as the ONLY writer of completed_at.
-- Client execution is removed; the progress coordinator calls it after gating.
alter function public.complete_tailoring_request(uuid,integer) rename to tailorme_complete_request_internal;
revoke all on function public.tailorme_complete_request_internal(uuid,integer) from public,anon,authenticated;
create function public.advance_request_progress(p_id uuid,p_stage text,p_note text,p_expected_version integer,p_confirm_completed boolean default false)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;trusted_role text;stages text[]:=array['confirmed','designing','stitching','fitting','ready','completed'];before_stage text;event_id uuid;normalized_note text:=coalesce(btrim(p_note),'');
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 select * into r from public.tailoring_requests where id=p_id for update;
 if not found or r.tailor_id is distinct from auth.uid() or trusted_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can update progress.' using errcode='42501';end if;
 if p_stage is null or array_position(stages,p_stage) is null or char_length(normalized_note)>1000 then raise exception 'Choose a valid stage and a customer-visible note of up to 1,000 characters.' using errcode='22023';end if;
 if p_stage='completed' and p_confirm_completed is distinct from true then raise exception 'Confirm completion before marking work Completed.' using errcode='22023';end if;
 if r.work_stage=p_stage and r.version=p_expected_version+1 and exists(select 1 from public.request_progress_history h where h.request_id=r.id and h.request_version=r.version and h.to_stage=p_stage and h.note=normalized_note) then return r;end if;
 if r.version is distinct from p_expected_version then raise exception 'Request changed. Refresh before updating progress.' using errcode='40001';end if;
 if r.completed_at is not null or r.status<>'accepted' then raise exception 'Progress requires an accepted incomplete request.' using errcode='22023';end if;
 if not exists(select 1 from public.request_quote_agreements a join public.request_quotations q on q.id=a.quote_id where a.request_id=r.id and q.status='accepted') then raise exception 'Accept the quotation before starting progress.' using errcode='22023';end if;
 if r.progress_stage is null then
  if p_stage<>'confirmed' then raise exception 'Start progress at Confirmed.' using errcode='22023';end if;
 elsif array_position(stages,p_stage)<=array_position(stages,r.progress_stage) then raise exception 'Progress can only move forward.' using errcode='22023';end if;
 before_stage:=r.work_stage;
 if p_stage='completed' then r:=public.tailorme_complete_request_internal(r.id,r.version);
 else update public.tailoring_requests set progress_stage=p_stage,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;end if;
 insert into public.request_progress_history(request_id,from_stage,to_stage,request_version,actor_id,changed_at,note)
 values(r.id,before_stage,p_stage,r.version,auth.uid(),case when p_stage='completed' then r.completed_at else clock_timestamp() end,normalized_note) returning id into event_id;
 insert into public.request_notifications(recipient_id,request_id,progress_event_id,kind) values(r.customer_id,r.id,event_id,'stage_changed') on conflict do nothing;
 return r;
end;$$;
revoke all on function public.advance_request_progress(uuid,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.advance_request_progress(uuid,text,text,integer,boolean) to authenticated;
-- Old callers cannot bypass explicit confirmation or progress eligibility.
create function public.complete_tailoring_request(p_id uuid,p_expected_version integer) returns public.tailoring_requests
language sql security definer set search_path='' as $$ select public.advance_request_progress(p_id,'completed','',p_expected_version,false);$$;
revoke all on function public.complete_tailoring_request(uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_tailoring_request(uuid,integer) to authenticated;
create function public.complete_tailoring_request(p_id uuid,p_expected_version integer,p_note text,p_confirmed boolean) returns public.tailoring_requests
language sql security definer set search_path='' as $$ select public.advance_request_progress(p_id,'completed',p_note,p_expected_version,p_confirmed);$$;
revoke all on function public.complete_tailoring_request(uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_tailoring_request(uuid,integer,text,boolean) to authenticated;
commit;
