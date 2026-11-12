begin;
-- Requires unchanged migrations 001 through 005, applied in order.
create table public.tailoring_requests (
  id uuid primary key,
  customer_id uuid not null references auth.users(id),
  tailor_id uuid not null references auth.users(id),
  customer_name text not null,
  shop_name text not null,
  garment_type text not null check (char_length(garment_type) between 1 and 100 and garment_type ~ '[^[:space:]]'),
  description text not null check (char_length(description) between 10 and 4000 and description ~ '[^[:space:]]'),
  quantity integer not null check (quantity between 1 and 100),
  preferred_date date not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  rejection_reason text check (char_length(rejection_reason) between 1 and 2000 and rejection_reason ~ '[^[:space:]]'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  check (customer_id <> tailor_id),
  check ((status = 'rejected') = (rejection_reason is not null)),
  check ((status in ('accepted','rejected')) = (responded_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index tailoring_requests_customer_idx on public.tailoring_requests(customer_id,created_at desc,id);
create index tailoring_requests_tailor_idx on public.tailoring_requests(tailor_id,created_at desc,id);
alter table public.tailoring_requests enable row level security;
revoke all on public.tailoring_requests from public, anon, authenticated;
grant select on public.tailoring_requests to authenticated;
create policy request_participants_read on public.tailoring_requests for select to authenticated
  using ((select auth.uid()) in (customer_id,tailor_id));

create function public.send_tailoring_request(p_id uuid, p_tailor_id uuid, p_garment_type text, p_description text, p_quantity integer, p_preferred_date date)
returns public.tailoring_requests language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); caller_role text; target_role text; shop public.tailor_profiles; result public.tailoring_requests; customer_name text;
begin
  if caller is null then raise exception 'Sign in as a customer to send a request.' using errcode='42501'; end if;
  -- Serializes retries from this customer, including concurrent first inserts.
  select role into caller_role from public.user_roles where user_id=caller for update;
  if caller_role is distinct from 'customer' then raise exception 'Only customers can send tailoring requests.' using errcode='42501'; end if;
  if p_id is null then raise exception 'A submission identifier is required.' using errcode='22023'; end if;
  select * into result from public.tailoring_requests where id=p_id;
  if found then
    if result.customer_id=caller and result.tailor_id=p_tailor_id and result.garment_type is not distinct from btrim(p_garment_type)
      and result.description is not distinct from btrim(p_description) and result.quantity is not distinct from p_quantity and result.preferred_date is not distinct from p_preferred_date then return result; end if;
    raise exception 'This submission identifier was already used. Open the existing request or start a new request.' using errcode='22023';
  end if;
  if p_tailor_id is null or p_tailor_id=caller then raise exception 'Choose an available tailor.' using errcode='22023'; end if;
  select role into target_role from public.user_roles where user_id=p_tailor_id and role='tailor' for share;
  if target_role is distinct from 'tailor' then raise exception 'This tailor is unavailable.' using errcode='22023'; end if;
  perform 1 from public.tailor_applications where applicant_id=p_tailor_id and status='approved' for share;
  if not found then raise exception 'This tailor is unavailable.' using errcode='22023'; end if;
  select * into shop from public.tailor_profiles where owner_id=p_tailor_id for share;
  if not found or not shop.is_published or not shop.accepting_requests then raise exception 'This shop is not accepting requests.' using errcode='22023'; end if;
  if p_preferred_date is null or p_preferred_date <= (now() at time zone 'Asia/Colombo')::date then raise exception 'Choose a future preferred completion date (Sri Lanka time).' using errcode='22023'; end if;
  select full_name into customer_name from public.profiles where id=caller;
  insert into public.tailoring_requests(id,customer_id,tailor_id,customer_name,shop_name,garment_type,description,quantity,preferred_date)
    values(p_id,caller,p_tailor_id,coalesce(customer_name,''),shop.shop_name,btrim(p_garment_type),btrim(p_description),p_quantity,p_preferred_date) returning * into result;
  return result;
end;
$$;
revoke all on function public.send_tailoring_request(uuid,uuid,text,text,integer,date) from public,anon,authenticated;
grant execute on function public.send_tailoring_request(uuid,uuid,text,text,integer,date) to authenticated;

create function public.decide_tailoring_request(p_id uuid,p_status text,p_reason text,p_expected_version integer)
returns public.tailoring_requests language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result public.tailoring_requests; caller_role text;
begin
  if caller is null then raise exception 'Sign in to update a request.' using errcode='42501'; end if;
  select role into caller_role from public.user_roles where user_id=caller for share;
  select * into result from public.tailoring_requests where id=p_id for update;
  if not found or caller not in (result.customer_id,result.tailor_id) then raise exception 'Request unavailable.' using errcode='42501'; end if;
  if p_status='cancelled' then
    if caller<>result.customer_id then raise exception 'Only the customer can cancel.' using errcode='42501'; end if;
  elsif p_status in ('accepted','rejected') then
    if caller<>result.tailor_id or caller_role is distinct from 'tailor' then raise exception 'Only the addressed tailor can respond.' using errcode='42501'; end if;
  else raise exception 'Choose a valid request action.' using errcode='22023'; end if;
  if p_status='rejected' then
    if p_reason is null or p_reason !~ '[^[:space:]]' or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Enter a rejection reason (1–2,000 characters).' using errcode='22023'; end if;
  elsif nullif(btrim(p_reason),'') is not null then raise exception 'A reason is only used when rejecting.' using errcode='22023'; end if;
  -- Retrying the same successful decision with its original version is safe.
  if result.status=p_status and result.version=p_expected_version+1 and result.rejection_reason is not distinct from (case when p_status='rejected' then btrim(p_reason) else null end) then return result; end if;
  if result.version is distinct from p_expected_version then raise exception 'Request changed. Refresh before deciding.' using errcode='40001'; end if;
  if result.status<>'pending' then raise exception 'Only pending requests can be changed.' using errcode='22023'; end if;
  update public.tailoring_requests set status=p_status,rejection_reason=case when p_status='rejected' then btrim(p_reason) else null end,
    responded_at=case when p_status in ('accepted','rejected') then clock_timestamp() else null end,
    cancelled_at=case when p_status='cancelled' then clock_timestamp() else null end,updated_at=clock_timestamp(),version=version+1
    where id=p_id returning * into result;
  return result;
end;
$$;
revoke all on function public.decide_tailoring_request(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.decide_tailoring_request(uuid,text,text,integer) to authenticated;
commit;
