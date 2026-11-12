begin;
-- Product input bounds in centimetres; numeric values have at most 2 decimal places.
create function public.valid_measurements(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n numeric;lo numeric;hi numeric;
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>2048 then return false;end if;
 for k in select jsonb_object_keys(v) loop
  case k
   when 'shoulder_width' then lo:=10;hi:=100;
   when 'bust_chest' then lo:=30;hi:=300;
   when 'waist' then lo:=20;hi:=300;
   when 'hip' then lo:=30;hi:=300;
   when 'sleeve_length' then lo:=1;hi:=120;
   when 'upper_arm' then lo:=5;hi:=100;
   when 'top_length' then lo:=10;hi:=200;
   when 'dress_length' then lo:=20;hi:=250;
   when 'trouser_length' then lo:=10;hi:=180;
   when 'inseam' then lo:=5;hi:=140;
   else return false;
  end case;
  if jsonb_typeof(v->k)<>'number' then return false;end if;
  n:=(v->>k)::numeric;
  if n<lo or n>hi or round(n,2)<>n then return false;end if;
 end loop;
 return true;
end;$$;
create table public.customer_measurements(
 owner_id uuid primary key references auth.users(id),
 values_cm jsonb not null check(public.valid_measurements(values_cm)),
 measured_on date not null,updated_at timestamptz not null default clock_timestamp()
);
alter table public.customer_measurements enable row level security;
revoke all on public.customer_measurements from public,anon,authenticated;
grant select,delete on public.customer_measurements to authenticated;
create policy measurement_owner_read on public.customer_measurements for select to authenticated using(owner_id=(select auth.uid()));
create policy measurement_owner_delete on public.customer_measurements for delete to authenticated using(owner_id=(select auth.uid()));
create function public.save_customer_measurements(p_values jsonb,p_measured_on date) returns public.customer_measurements language plpgsql security definer set search_path='' as $$
declare r public.customer_measurements;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='customer' for update;
 if not found then raise exception 'Only customers can save measurements.' using errcode='42501';end if;
 if not public.valid_measurements(p_values) or p_measured_on is null or p_measured_on>(now() at time zone 'Asia/Colombo')::date or p_measured_on<date '1900-01-01' then raise exception 'Invalid measurements or measured-on date.' using errcode='22023';end if;
 insert into public.customer_measurements(owner_id,values_cm,measured_on) values(auth.uid(),p_values,p_measured_on)
 on conflict(owner_id) do update set values_cm=excluded.values_cm,measured_on=excluded.measured_on,updated_at=clock_timestamp() returning * into r;
 return r;
end;$$;
create table public.request_measurement_snapshots(
 request_id uuid primary key references public.tailoring_requests(id),
 values_cm jsonb not null check(public.valid_measurements(values_cm) and values_cm<>'{}'::jsonb),
 measured_on date not null,consented_at timestamptz not null default clock_timestamp(),snapshot_version integer not null default 1 check(snapshot_version=1)
);
alter table public.request_measurement_snapshots enable row level security;
revoke all on public.request_measurement_snapshots from public,anon,authenticated;
grant select on public.request_measurement_snapshots to authenticated;
create policy measurement_participant_read on public.request_measurement_snapshots for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create function public.send_tailoring_request_with_measurements(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_share boolean,p_values jsonb,p_measured_on date,p_design_id uuid default null,p_design_version integer default null)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;s public.request_measurement_snapshots;m public.customer_measurements;existing boolean;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='customer' for update;
 if not found then raise exception 'Only customers can send requests.' using errcode='42501';end if;
 if p_share is null or (not p_share and (p_values is not null or p_measured_on is not null)) or (p_share and (not public.valid_measurements(p_values) or p_values='{}'::jsonb or p_measured_on is null)) then raise exception 'Explicit consent and valid measurements are required.' using errcode='22023';end if;
 if (p_design_id is null)<>(p_design_version is null) then raise exception 'Invalid design selection.' using errcode='22023';end if;
 select * into r from public.tailoring_requests where id=p_id;existing:=found;
 if existing then
  if r.customer_id<>auth.uid() then raise exception 'Request unavailable.' using errcode='42501';end if;
  select * into s from public.request_measurement_snapshots where request_id=p_id;
  if p_share<>found or (p_share and (s.values_cm is distinct from p_values or s.measured_on is distinct from p_measured_on)) then raise exception 'Submission measurements differ. Open the saved request.' using errcode='22023';end if;
  if p_design_id is null and exists(select 1 from public.request_design_snapshots where request_id=p_id) then raise exception 'Submission design differs.' using errcode='22023';end if;
 elsif p_share then
  select * into m from public.customer_measurements where owner_id=auth.uid() for share;
  if not found or m.values_cm is distinct from p_values or m.measured_on is distinct from p_measured_on then raise exception 'Measurements changed. Refresh and review before sharing.' using errcode='22023';end if;
 end if;
 if p_design_id is null then r:=public.send_tailoring_request(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date);
 else r:=public.send_tailoring_request_with_design(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date,p_design_id,p_design_version);end if;
 if p_share and not existing then insert into public.request_measurement_snapshots(request_id,values_cm,measured_on) values(r.id,p_values,p_measured_on);end if;
 return r;
end;$$;
revoke all on function public.valid_measurements(jsonb),public.save_customer_measurements(jsonb,date),public.send_tailoring_request_with_measurements(uuid,uuid,text,text,integer,date,boolean,jsonb,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.valid_measurements(jsonb),public.save_customer_measurements(jsonb,date),public.send_tailoring_request_with_measurements(uuid,uuid,text,text,integer,date,boolean,jsonb,date,uuid,integer) to authenticated;
commit;
