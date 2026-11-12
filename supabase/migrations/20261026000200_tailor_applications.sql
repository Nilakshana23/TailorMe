begin;

create table public.tailor_applications (
  applicant_id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default '' check (char_length(shop_name) <= 160),
  phone text not null default '' check (char_length(phone) <= 32),
  city text not null default '' check (char_length(city) <= 120),
  address text not null default '' check (char_length(address) <= 500),
  description text not null default '' check (char_length(description) <= 4000),
  specialties text not null default '' check (char_length(specialties) <= 500),
  years_experience integer check (years_experience between 0 and 80),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  reviewer_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  constraint application_submission_complete check (
    status = 'draft' or (
      char_length(regexp_replace(shop_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
      and char_length(regexp_replace(city, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
      and char_length(regexp_replace(address, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 5
      and char_length(regexp_replace(description, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 20
      and char_length(regexp_replace(specialties, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
      and years_experience is not null
      and phone ~ '^[+0-9() .-]{7,32}$'
      and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  ),
  constraint application_decision_fields check (
    (status in ('draft', 'pending') and reviewer_id is null and reviewed_at is null and rejection_reason is null)
    or (status = 'approved' and reviewer_id is not null and reviewed_at is not null and rejection_reason is null)
    or (status = 'rejected' and reviewer_id is not null and reviewed_at is not null
      and rejection_reason is not null and rejection_reason ~ '[^[:space:]]')
  )
);
create index tailor_applications_status_updated_idx on public.tailor_applications (status, updated_at desc);
alter table public.tailor_applications enable row level security;
revoke all on public.tailor_applications from public, anon, authenticated;
grant select on public.tailor_applications to authenticated;

-- One-way lookup of the caller's own role; user_roles policies do not reference
-- applications, so this cannot recurse. No definer helper is needed for reads.
create policy applications_read_own_or_admin on public.tailor_applications
  for select to authenticated using (
    applicant_id = (select auth.uid()) or exists (
      select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );
-- No table write grants/policies. All mutations use the narrowly scoped RPCs below.

create function public.tailorme_application_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') then
      raise exception 'New applications must start as draft or pending.' using errcode = '23514';
    end if;
    new.version := 1;
    new.created_at := clock_timestamp();
  else
    if new.applicant_id is distinct from old.applicant_id then
      raise exception 'Applicant identity cannot change.' using errcode = '23514';
    end if;
    if not ((old.status in ('draft', 'rejected') and new.status in ('draft', 'pending'))
      or (old.status = 'pending' and new.status in ('approved', 'rejected'))) then
      raise exception 'Invalid application state transition.' using errcode = '23514';
    end if;
    if old.status = 'pending' and row(new.shop_name, new.phone, new.city, new.address,
      new.description, new.specialties, new.years_experience) is distinct from
      row(old.shop_name, old.phone, old.city, old.address, old.description, old.specialties, old.years_experience) then
      raise exception 'Pending application details cannot change.' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.tailorme_application_transition() from public, anon, authenticated;
create trigger tailor_application_transition before insert or update on public.tailor_applications
  for each row execute function public.tailorme_application_transition();

create function public.save_tailor_application(
  p_shop_name text, p_phone text, p_city text, p_address text,
  p_description text, p_specialties text, p_years_experience integer,
  p_submit boolean, p_expected_version integer
)
returns public.tailor_applications language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  application public.tailor_applications;
  next_status text;
begin
  if caller is null then raise exception 'Sign in to apply.' using errcode = '42501'; end if;
  -- Lock the role before the application in both RPCs, serializing first saves,
  -- submissions, and approval without permitting a stale customer role.
  select role into caller_role from public.user_roles where user_id = caller for update;
  if caller_role is distinct from 'customer' then
    raise exception 'Only customers can apply.' using errcode = '42501';
  end if;
  if p_submit is null then raise exception 'Choose draft or submit.' using errcode = '22023'; end if;
  next_status := case when p_submit then 'pending' else 'draft' end;
  select * into application from public.tailor_applications where applicant_id = caller for update;
  if found then
    if application.status not in ('draft', 'rejected') then
      raise exception 'Pending or approved applications cannot be edited.' using errcode = '22023';
    end if;
    if p_expected_version is distinct from application.version then
      raise exception 'Application changed. Reload before saving.' using errcode = '40001';
    end if;
    update public.tailor_applications set
      shop_name = btrim(p_shop_name), phone = btrim(p_phone), city = btrim(p_city), address = btrim(p_address),
      description = btrim(p_description), specialties = btrim(p_specialties), years_experience = p_years_experience,
      status = next_status, reviewer_id = null, reviewed_at = null, rejection_reason = null
    where applicant_id = caller returning * into application;
  else
    if p_expected_version is not null then
      raise exception 'Application changed. Reload before saving.' using errcode = '40001';
    end if;
    insert into public.tailor_applications (applicant_id, shop_name, phone, city, address,
      description, specialties, years_experience, status)
    values (caller, btrim(p_shop_name), btrim(p_phone), btrim(p_city), btrim(p_address),
      btrim(p_description), btrim(p_specialties), p_years_experience, next_status)
    returning * into application;
  end if;
  return application;
end;
$$;
revoke all on function public.save_tailor_application(text,text,text,text,text,text,integer,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.save_tailor_application(text,text,text,text,text,text,integer,boolean,integer) to authenticated;

create function public.review_tailor_application(
  p_applicant_id uuid, p_decision text, p_rejection_reason text, p_expected_version integer
)
returns public.tailor_applications language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  applicant_role text;
  application public.tailor_applications;
begin
  if caller is null then raise exception 'Admin access required.' using errcode = '42501'; end if;
  select role into caller_role from public.user_roles where user_id = caller for share;
  if caller_role is distinct from 'admin' then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and (p_rejection_reason is null or p_rejection_reason !~ '[^[:space:]]' or char_length(btrim(p_rejection_reason)) not between 1 and 2000) then
    raise exception 'A rejection reason of 1–2000 characters is required.' using errcode = '22023';
  end if;
  if p_decision = 'approved' and nullif(btrim(p_rejection_reason), '') is not null then
    raise exception 'Approval cannot include a rejection reason.' using errcode = '22023';
  end if;
  select role into applicant_role from public.user_roles where user_id = p_applicant_id for update;
  if applicant_role is distinct from 'customer' then
    raise exception 'Applicant must still be a customer; no admin or tailor role can be changed.' using errcode = '22023';
  end if;
  select * into application from public.tailor_applications where applicant_id = p_applicant_id for update;
  if not found or application.status <> 'pending' then
    raise exception 'Only pending applications can be reviewed.' using errcode = '22023';
  end if;
  if p_expected_version is distinct from application.version then
    raise exception 'Application changed. Reload before reviewing.' using errcode = '40001';
  end if;
  if p_decision = 'approved' then
    update public.user_roles set role = 'tailor' where user_id = p_applicant_id and role = 'customer';
    if not found then raise exception 'Applicant role changed; reload before reviewing.' using errcode = '40001'; end if;
  end if;
  update public.tailor_applications set status = p_decision, reviewer_id = caller, reviewed_at = clock_timestamp(),
    rejection_reason = case when p_decision = 'rejected' then btrim(p_rejection_reason) else null end
    where applicant_id = p_applicant_id returning * into application;
  return application;
end;
$$;
revoke all on function public.review_tailor_application(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.review_tailor_application(uuid,text,text,integer) to authenticated;

commit;
