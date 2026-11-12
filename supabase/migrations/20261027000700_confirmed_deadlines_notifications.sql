begin;
alter table public.tailoring_requests add column confirmed_date date;
alter table public.tailoring_requests add column deadline_revision integer not null default 0;
alter table public.tailoring_requests add column confirmed_at timestamptz;
alter table public.tailoring_requests add column completed_at timestamptz;
alter table public.tailoring_requests add constraint request_completion_accepted check (completed_at is null or status='accepted');
create index request_deadline_worker_idx on public.tailoring_requests(confirmed_date,id) where status='accepted' and completed_at is null;
create table public.request_deadline_history (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.tailoring_requests(id),
 revision integer not null, previous_date date, confirmed_date date not null, changed_by uuid not null references auth.users(id), changed_at timestamptz not null default now(), unique(request_id,revision)
);
alter table public.request_deadline_history enable row level security;
revoke all on public.request_deadline_history from public,anon,authenticated;
grant select on public.request_deadline_history to authenticated;
create policy deadline_history_participants on public.request_deadline_history for select to authenticated using (exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create table public.request_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id), request_id uuid not null references public.tailoring_requests(id),
 revision integer not null, kind text not null check(kind in('two_days','due_today')), confirmed_date date not null,
 created_at timestamptz not null default now(), read_at timestamptz, invalidated_at timestamptz, unique(request_id,revision,kind)
);
create index request_notifications_recipient_idx on public.request_notifications(recipient_id,created_at desc);
alter table public.request_notifications enable row level security;
revoke all on public.request_notifications from public,anon,authenticated;
grant select on public.request_notifications to authenticated;
create policy notifications_recipient on public.request_notifications for select to authenticated using(recipient_id=(select auth.uid()));
create function public.mark_request_notification_read(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.request_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and recipient_id=auth.uid();
 if not found then raise exception 'Notification unavailable.' using errcode='42501'; end if;
end; $$;
revoke all on function public.mark_request_notification_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_request_notification_read(uuid) to authenticated;
create function public.set_request_confirmed_date(p_id uuid,p_date date,p_expected_version integer) returns public.tailoring_requests
language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests; trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 select * into r from public.tailoring_requests where id=p_id for update;
 if not found or r.tailor_id is distinct from auth.uid() or trusted_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can confirm a date.' using errcode='42501'; end if;
 if r.status<>'accepted' or r.completed_at is not null then raise exception 'Only accepted incomplete work can be scheduled.' using errcode='22023'; end if;
 if r.confirmed_date=p_date and r.version=p_expected_version+1 then return r; end if;
 if r.version is distinct from p_expected_version then raise exception 'Request changed. Refresh before scheduling.' using errcode='40001'; end if;
 if p_date is null or p_date<(now() at time zone 'Asia/Colombo')::date then raise exception 'Choose today or a future confirmed date (Sri Lanka time).' using errcode='22023'; end if;
 if r.confirmed_date=p_date then return r; end if;
 insert into public.request_deadline_history(request_id,revision,previous_date,confirmed_date,changed_by) values(r.id,r.deadline_revision+1,r.confirmed_date,p_date,auth.uid());
 update public.request_notifications set invalidated_at=clock_timestamp() where request_id=r.id and invalidated_at is null;
 update public.tailoring_requests set confirmed_date=p_date,confirmed_at=clock_timestamp(),deadline_revision=deadline_revision+1,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 return r;
end; $$;
revoke all on function public.set_request_confirmed_date(uuid,date,integer) from public,anon,authenticated;
grant execute on function public.set_request_confirmed_date(uuid,date,integer) to authenticated;
create function public.complete_tailoring_request(p_id uuid,p_expected_version integer) returns public.tailoring_requests
language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests; trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 select * into r from public.tailoring_requests where id=p_id for update;
 if not found or r.tailor_id is distinct from auth.uid() or trusted_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can complete work.' using errcode='42501'; end if;
 if r.completed_at is not null and r.version=p_expected_version+1 then return r; end if;
 if r.version is distinct from p_expected_version then raise exception 'Request changed. Refresh before completing.' using errcode='40001'; end if;
 if r.status<>'accepted' or r.completed_at is not null then raise exception 'Only accepted incomplete work can be completed.' using errcode='22023'; end if;
 update public.tailoring_requests set completed_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 update public.request_notifications set invalidated_at=clock_timestamp() where request_id=r.id and invalidated_at is null;
 return r;
end; $$;
revoke all on function public.complete_tailoring_request(uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_tailoring_request(uuid,integer) to authenticated;
-- Internal timestamp parameter permits deterministic boundary tests, never API execution.
create function public.tailorme_generate_deadline_reminders(p_now timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests; today date := (p_now at time zone 'Asia/Colombo')::date; inserted integer :=0; affected integer; reminder_kind text;
begin
 for r in select * from public.tailoring_requests where status='accepted' and completed_at is null and confirmed_date in(today,today+2) order by id for update loop
  if (r.confirmed_at at time zone 'Asia/Colombo')::date>today then continue; end if;
  reminder_kind := case when r.confirmed_date=today then 'due_today' else 'two_days' end;
  insert into public.request_notifications(recipient_id,request_id,revision,kind,confirmed_date,created_at)
   values(r.tailor_id,r.id,r.deadline_revision,reminder_kind,r.confirmed_date,p_now) on conflict(request_id,revision,kind) do nothing;
  get diagnostics affected=row_count; inserted:=inserted+affected;
 end loop;
 return inserted;
end; $$;
revoke all on function public.tailorme_generate_deadline_reminders(timestamptz) from public,anon,authenticated;
create function public.run_deadline_reminders() returns integer language sql security definer set search_path='' as $$ select public.tailorme_generate_deadline_reminders(clock_timestamp()); $$;
revoke all on function public.run_deadline_reminders() from public,anon,authenticated;
commit;
