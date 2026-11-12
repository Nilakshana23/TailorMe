begin;
create table public.request_quotations (
 id uuid primary key, request_id uuid not null references public.tailoring_requests(id), quote_number integer not null,
 currency text not null default 'LKR' check(currency='LKR'),
 stitching numeric(14,2) not null check(stitching>=0), material numeric(14,2) not null check(material>=0), other numeric(14,2) not null check(other>=0),
 total numeric(14,2) generated always as(stitching+material+other) stored,
 other_explanation text not null default '' check(char_length(other_explanation)<=1000), notes text not null default '' check(char_length(notes)<=2000),
 status text not null default 'outstanding' check(status in('outstanding','withdrawn','accepted','declined')),
 version integer not null default 1, created_at timestamptz not null default now(), answered_at timestamptz,
 check(stitching+material+other>0),check(other=0 or other_explanation ~ '[^[:space:]]'),unique(request_id,quote_number)
);
create unique index one_outstanding_quote on public.request_quotations(request_id) where status='outstanding';
create unique index one_accepted_quote on public.request_quotations(request_id) where status='accepted';
alter table public.request_quotations enable row level security;
revoke all on public.request_quotations from public,anon,authenticated;
grant select on public.request_quotations to authenticated;
create policy quotation_participants on public.request_quotations for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
-- Cast money to strings at the database boundary; no JS floating-point arithmetic.
create view public.quotation_details with(security_invoker=true) as
 select id,request_id,quote_number,currency,stitching::text,material::text,other::text,total::text,other_explanation,notes,status,version,created_at,answered_at from public.request_quotations;
revoke all on public.quotation_details from public,anon,authenticated;
grant select on public.quotation_details to authenticated;
create table public.request_quote_agreements (
 request_id uuid primary key references public.tailoring_requests(id), quote_id uuid not null unique references public.request_quotations(id),
 quote_number integer not null,currency text not null,stitching numeric(14,2) not null,material numeric(14,2) not null,other numeric(14,2) not null,total numeric(14,2) not null,
 other_explanation text not null,notes text not null,accepted_by uuid not null references auth.users(id),accepted_at timestamptz not null default now()
);
alter table public.request_quote_agreements enable row level security;
revoke all on public.request_quote_agreements from public,anon,authenticated;
grant select on public.request_quote_agreements to authenticated;
create policy agreement_participants on public.request_quote_agreements for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
alter table public.request_notifications add column quote_id uuid references public.request_quotations(id);
alter table public.request_notifications alter column revision drop not null;
alter table public.request_notifications alter column confirmed_date drop not null;
alter table public.request_notifications drop constraint request_notifications_kind_check;
alter table public.request_notifications add constraint request_notifications_kind_check check(kind in('two_days','due_today','quote_sent','quote_accepted','quote_declined'));
alter table public.request_notifications add constraint notification_event_shape check(
 (kind in('two_days','due_today') and quote_id is null and revision is not null and confirmed_date is not null)
 or (kind in('quote_sent','quote_accepted','quote_declined') and quote_id is not null and revision is null and confirmed_date is null));
create unique index quote_notification_once on public.request_notifications(quote_id,kind) where quote_id is not null;

create function public.send_request_quotation(p_id uuid,p_request_id uuid,p_expected_request_version integer,p_stitching text,p_material text,p_other text,p_other_explanation text,p_notes text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;q public.request_quotations;trusted_role text;next_number integer;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 select * into r from public.tailoring_requests where id=p_request_id for update;
 if not found or r.tailor_id is distinct from auth.uid() or trusted_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can send a quotation.' using errcode='42501';end if;
 if p_id is null or p_stitching is null or p_material is null or p_other is null
 or p_stitching !~ '^[0-9]{1,9}\.[0-9]{2}$' or p_material !~ '^[0-9]{1,9}\.[0-9]{2}$' or p_other !~ '^[0-9]{1,9}\.[0-9]{2}$' then raise exception 'Use nonnegative LKR amounts with exactly 2 decimal places, up to 999999999.99 per charge.' using errcode='22023';end if;
 select * into q from public.request_quotations where id=p_id;
 if found then
  if q.request_id=r.id and q.stitching=p_stitching::numeric and q.material=p_material::numeric and q.other=p_other::numeric and q.other_explanation=coalesce(btrim(p_other_explanation),'') and q.notes=coalesce(btrim(p_notes),'') then return q.id;end if;
  raise exception 'Submission identifier already used. Refresh quotation history.' using errcode='22023';
 end if;
 if r.version is distinct from p_expected_request_version then raise exception 'Request changed. Refresh before quoting.' using errcode='40001';end if;
 if r.status<>'accepted' or r.completed_at is not null then raise exception 'Only accepted incomplete requests can be quoted.' using errcode='22023';end if;
 if exists(select 1 from public.request_quotations where request_id=r.id and status in('outstanding','accepted')) then raise exception 'An outstanding or accepted quotation already exists. Withdraw an unanswered quotation before revising.' using errcode='22023';end if;
 select coalesce(max(quote_number),0)+1 into next_number from public.request_quotations where request_id=r.id;
 insert into public.request_quotations(id,request_id,quote_number,stitching,material,other,other_explanation,notes)
 values(p_id,r.id,next_number,p_stitching::numeric,p_material::numeric,p_other::numeric,coalesce(btrim(p_other_explanation),''),coalesce(btrim(p_notes),'')) returning * into q;
 insert into public.request_notifications(recipient_id,request_id,quote_id,kind) values(r.customer_id,r.id,q.id,'quote_sent') on conflict do nothing;
 return q.id;
end;$$;
revoke all on function public.send_request_quotation(uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.send_request_quotation(uuid,uuid,integer,text,text,text,text,text) to authenticated;

create function public.answer_request_quotation(p_id uuid,p_status text,p_expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.request_quotations;r public.tailoring_requests;trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 select * into q from public.request_quotations where id=p_id;
 if not found then raise exception 'Quotation unavailable.' using errcode='42501';end if;
 select * into r from public.tailoring_requests where id=q.request_id for update;
 if auth.uid() is null or auth.uid() not in(r.customer_id,r.tailor_id) then raise exception 'Quotation unavailable.' using errcode='42501';end if;
 select * into q from public.request_quotations where id=p_id for update;
 if p_status='withdrawn' then
  if auth.uid()<>r.tailor_id or trusted_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can withdraw.' using errcode='42501';end if;
 elsif p_status in('accepted','declined') then
  if auth.uid()<>r.customer_id then raise exception 'Only the request customer can answer.' using errcode='42501';end if;
 else raise exception 'Choose accept, decline or withdraw.' using errcode='22023';end if;
 if q.status=p_status and q.version=p_expected_version+1 then return q.id;end if;
 if q.version is distinct from p_expected_version then raise exception 'Quotation changed. Refresh before deciding.' using errcode='40001';end if;
 if q.status<>'outstanding' then raise exception 'Only outstanding quotations can be answered or withdrawn.' using errcode='22023';end if;
 if p_status='accepted' and (r.status<>'accepted' or r.completed_at is not null) then raise exception 'Only accepted incomplete requests can have a quotation accepted.' using errcode='22023';end if;
 update public.request_quotations set status=p_status,version=version+1,answered_at=clock_timestamp() where id=q.id returning * into q;
 if p_status='accepted' then
  insert into public.request_quote_agreements(request_id,quote_id,quote_number,currency,stitching,material,other,total,other_explanation,notes,accepted_by)
  values(r.id,q.id,q.quote_number,q.currency,q.stitching,q.material,q.other,q.total,q.other_explanation,q.notes,auth.uid());
 end if;
 if p_status in('accepted','declined') then
  insert into public.request_notifications(recipient_id,request_id,quote_id,kind) values(r.tailor_id,r.id,q.id,case when p_status='accepted' then 'quote_accepted' else 'quote_declined' end) on conflict do nothing;
 end if;
 return q.id;
end;$$;
revoke all on function public.answer_request_quotation(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.answer_request_quotation(uuid,text,integer) to authenticated;

create or replace function public.set_request_confirmed_date(p_id uuid,p_date date,p_expected_version integer) returns public.tailoring_requests
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
 update public.request_notifications set invalidated_at=clock_timestamp() where request_id=r.id and invalidated_at is null and kind in('two_days','due_today');
 update public.tailoring_requests set confirmed_date=p_date,confirmed_at=clock_timestamp(),deadline_revision=deadline_revision+1,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 return r;
end; $$;

create or replace function public.complete_tailoring_request(p_id uuid,p_expected_version integer) returns public.tailoring_requests
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
 update public.request_notifications set invalidated_at=clock_timestamp() where request_id=r.id and invalidated_at is null and kind in('two_days','due_today');
 return r;
end; $$;

commit;
