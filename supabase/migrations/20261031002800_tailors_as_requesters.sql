begin;
-- Requires migrations 001-027, unchanged and in chronological order.
-- customer_id remains the requester identity, independent of trusted portal role.
-- Existing participant RLS, snapshots and provider-only mutations are retained.

-- Latest implementation from 20261027000600_tailoring_requests.sql; narrow requester eligibility change.
create or replace function public.send_tailoring_request(p_id uuid, p_tailor_id uuid, p_garment_type text, p_description text, p_quantity integer, p_preferred_date date)
returns public.tailoring_requests language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); caller_role text; target_role text; shop public.tailor_profiles; result public.tailoring_requests; customer_name text;
begin
  if caller is null then raise exception 'Sign in to send a request.' using errcode='42501'; end if;
  -- Serializes retries from this customer, including concurrent first inserts.
  select role into caller_role from public.user_roles where user_id=caller for update;
  if (caller_role is null or caller_role not in ('customer','tailor')) then raise exception 'Only customers and tailors can send tailoring requests.' using errcode='42501'; end if;
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

-- Latest implementation from 20261029001700_my_measurements.sql; narrow requester eligibility change.
create or replace function public.send_tailoring_request_with_measurements(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_share boolean,p_values jsonb,p_measured_on date,p_design_id uuid default null,p_design_version integer default null)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;s public.request_measurement_snapshots;m public.customer_measurements;existing boolean;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role in ('customer','tailor') for update;
 if not found then raise exception 'Only customers and tailors can send requests.' using errcode='42501';end if;
 -- Ordering never expands access to customer-only measurement/designer tools.
 if exists(select 1 from public.user_roles where user_id=auth.uid() and role='tailor')
  and (p_share is distinct from false or p_values is not null or p_measured_on is not null or p_design_id is not null or p_design_version is not null)
 then raise exception 'Tailor orders cannot share customer-only measurements or designer data.' using errcode='42501';end if;
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

-- Latest implementation from 20261029002100_private_request_references.sql; narrow requester eligibility change.
create or replace function public.reserve_request_reference(p_id uuid,p_batch_id uuid,p_extension text) returns public.request_reference_uploads language plpgsql security definer set search_path='' as $$
declare u public.request_reference_uploads;path text;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role in ('customer','tailor') for update;
 if not found then raise exception 'Only customers and tailors can add request references.' using errcode='42501';end if;
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

-- Latest implementation from 20261029002100_private_request_references.sql; narrow requester eligibility change.
create or replace function public.send_tailoring_request_with_references(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_share boolean,p_values jsonb,p_measured_on date,p_references jsonb,p_reference_batch uuid,p_design_id uuid default null,p_design_version integer default null)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare r public.tailoring_requests;u public.request_reference_uploads;item jsonb;normalized jsonb:='[]';saved jsonb;position integer:=0;existing boolean;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role in ('customer','tailor') for update;
 if not found then raise exception 'Only customers and tailors can send requests.' using errcode='42501';end if;
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

-- Latest implementation from 20261030002600_reference_upload_authorization_metadata.sql; narrow requester eligibility change.
create or replace function public.reference_upload_allowed(path text,meta jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,21));
 return public.valid_chat_upload_metadata(path,meta) and exists(
  select 1 from public.request_reference_uploads u join public.user_roles r on r.user_id=u.owner_id
  where u.owner_id=auth.uid() and r.role in ('customer','tailor') and u.image_path=path and u.submitted_request_id is null);
end;$$;

-- CREATE OR REPLACE retains the existing restricted EXECUTE grants.
commit;
