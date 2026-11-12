-- Additive migration: preserve preset designs and immutable existing snapshots.
begin;
create function public.valid_custom_neckline(geometry jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare depths jsonb; item jsonb; y numeric;
begin
 if geometry is null or jsonb_typeof(geometry)<>'object' or octet_length(geometry::text)>512 then return false;end if;
 if (geometry-'depths')<>'{}'::jsonb or not (geometry ? 'depths') then return false;end if;
 depths:=geometry->'depths';
 if jsonb_typeof(depths)<>'array' then return false;end if;
 if jsonb_array_length(depths)<>5 then return false;end if;
 for item in select value from jsonb_array_elements(depths) loop
  if jsonb_typeof(item)<>'number' then return false;end if;
  y:=item::text::numeric;
  if y<65 or y>120 or trunc(y*10)<>y*10 then return false;end if;
 end loop;
 return (depths->>0)::numeric=65 and (depths->>4)::numeric=65 and
  ((depths->>1)::numeric>65 or (depths->>2)::numeric>65 or (depths->>3)::numeric>65);
end;$$;
revoke all on function public.valid_custom_neckline(jsonb) from public,anon;
grant execute on function public.valid_custom_neckline(jsonb) to authenticated;
alter table public.customer_designs add column format_version integer not null default 1,
 add column custom_neckline jsonb,
 add constraint customer_design_geometry check(format_version in(1,2) and
 (custom_neckline is null or (format_version=2 and garment_type<>'skirt' and public.valid_custom_neckline(custom_neckline))));
alter table public.request_design_snapshots add column format_version integer not null default 1,
 add column custom_neckline jsonb,
 add constraint snapshot_design_geometry check(format_version in(1,2) and
 (custom_neckline is null or (format_version=2 and garment_type<>'skirt' and public.valid_custom_neckline(custom_neckline))));
-- Fixed x anchors: 143,151.5,160,168.5,177. Each cubic has horizontal
-- controls at one-third/two-thirds of its x interval and endpoint depths.
-- Bounds and strictly increasing x guarantee no self-intersections/overshoot.
create or replace function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs
language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;trusted_role text;fmt integer;geometry jsonb;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 if auth.uid() is null or trusted_role is distinct from 'customer' then raise exception 'Only signed-in customers can save designs.' using errcode='42501';end if;
 if p_id is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or(p_fields-array['name','garment_type','colour','neckline','sleeve','length','format_version','custom_neckline'])<>'{}'::jsonb then raise exception 'Choose supported design options.' using errcode='22023';end if;
 if octet_length(p_fields::text)>2048 then raise exception 'Design data is too large.' using errcode='22023';end if;
 if p_fields ? 'format_version' and (jsonb_typeof(p_fields->'format_version')<>'number' or p_fields->>'format_version' not in ('1','2')) then raise exception 'Unsupported design format.' using errcode='22023';end if;
 fmt:=coalesce((p_fields->>'format_version')::integer,1);
 geometry:=nullif(p_fields->'custom_neckline','null'::jsonb);
 if geometry is not null and (fmt<>2 or p_fields->>'garment_type'='skirt' or not public.valid_custom_neckline(geometry)) then raise exception 'Invalid custom neckline geometry.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_fields-array['format_version','custom_neckline']) where jsonb_typeof(value)<>'string') then raise exception 'Design options must be text values.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;
 if found then
  if d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
  if d.version=coalesce(p_expected_version,0)+1 and d.name=btrim(p_fields->>'name') and d.garment_type=p_fields->>'garment_type' and d.colour=p_fields->>'colour' and d.neckline=p_fields->>'neckline' and d.sleeve=p_fields->>'sleeve' and d.length=p_fields->>'length' and d.format_version=fmt and d.custom_neckline is not distinct from geometry then return d;end if;
  if d.version is distinct from p_expected_version then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
  if d.attached_at is not null or exists(select 1 from public.request_design_snapshots where design_id=d.id) then raise exception 'Attached designs are read-only. Create a new design to make changes.' using errcode='22023';end if;
  update public.customer_designs set name=btrim(p_fields->>'name'),garment_type=p_fields->>'garment_type',colour=p_fields->>'colour',neckline=p_fields->>'neckline',sleeve=p_fields->>'sleeve',length=p_fields->>'length',format_version=fmt,custom_neckline=geometry,version=version+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 else
  if p_expected_version is not null then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
  insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline) values(p_id,auth.uid(),btrim(p_fields->>'name'),p_fields->>'garment_type',p_fields->>'colour',p_fields->>'neckline',p_fields->>'sleeve',p_fields->>'length',fmt,geometry) returning * into d;
 end if;
 return d;
end;$$;
revoke all on function public.save_customer_design(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_customer_design(uuid,jsonb,integer) to authenticated;
create or replace function public.send_tailoring_request_with_design(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_design_id uuid,p_design_version integer)
returns public.tailoring_requests language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;r public.tailoring_requests;s public.request_design_snapshots;trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for update;
 if auth.uid() is null or trusted_role is distinct from 'customer' then raise exception 'Only customers can submit a design request.' using errcode='42501';end if;
 select * into r from public.tailoring_requests where id=p_id;
 if found then
  select * into s from public.request_design_snapshots where request_id=r.id;
  if r.customer_id<>auth.uid() or not found or s.design_id is distinct from p_design_id or s.design_version is distinct from p_design_version then raise exception 'Submission design differs. Open the saved request.' using errcode='22023';end if;
  return public.send_tailoring_request(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date);
 end if;
 select * into d from public.customer_designs where id=p_design_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Choose one of your saved designs.' using errcode='42501';end if;
 if d.version is distinct from p_design_version then raise exception 'Design changed while browsing. Reopen your design and find a tailor again.' using errcode='40001';end if;
 if btrim(p_garment_type) is distinct from d.garment_type then raise exception 'Request garment must match the selected design.' using errcode='22023';end if;
 r:=public.send_tailoring_request(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date);
 insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline)
 values(r.id,d.id,d.version,d.name,d.garment_type,d.colour,d.neckline,d.sleeve,d.length,d.format_version,d.custom_neckline);
 update public.customer_designs set attached_at=coalesce(attached_at,clock_timestamp()) where id=d.id;
 return r;
end;$$;
revoke all on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) to authenticated;
commit;
