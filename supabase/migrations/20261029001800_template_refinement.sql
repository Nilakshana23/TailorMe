begin;
-- Additive, numeric illustration geometry and an owner-controlled copied sketch reference.
create function public.valid_refinement_geometry(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n numeric;lo integer;hi integer;
begin
 if v is null or jsonb_typeof(v)<>'object' or not(v ?& array['shoulder','waist','hem','sleeve_width','sleeve_length','waist_y','hem_y']) or (v-array['shoulder','waist','hem','sleeve_width','sleeve_length','waist_y','hem_y'])<>'{}'::jsonb then return false;end if;
 for k in select jsonb_object_keys(v) loop
  case k when 'shoulder' then lo:=32;hi:=48;when 'waist' then lo:=22;hi:=42;when 'hem' then lo:=35;hi:=95;when 'sleeve_width' then lo:=20;hi:=48;when 'sleeve_length' then lo:=60;hi:=220;when 'waist_y' then lo:=175;hi:=210;when 'hem_y' then lo:=280;hi:=440;end case;
  if jsonb_typeof(v->k)<>'number' then return false;end if;n:=(v->>k)::numeric;
  if n<lo or n>hi or trunc(n)<>n then return false;end if;
 end loop;return true;
end;$$;
alter table public.customer_designs add column refinement_geometry jsonb,add column source_reference jsonb,add column include_source_reference boolean not null default false,
 add constraint design_refinement_geometry check(refinement_geometry is null or (design_kind='garment' and format_version=3 and public.valid_refinement_geometry(refinement_geometry))),
 add constraint design_reference_selection check(not include_source_reference or source_reference is not null);
alter table public.request_design_snapshots add column refinement_geometry jsonb,add column source_reference jsonb,add column include_source_reference boolean not null default false,
 add constraint snapshot_refinement_geometry check(refinement_geometry is null or (design_kind='garment' and format_version=3 and public.valid_refinement_geometry(refinement_geometry)));

-- Keep the existing validated save logic behind a wrapper; no historical migration edits.
alter function public.save_customer_design(uuid,jsonb,integer) rename to save_customer_design_base;
revoke all on function public.save_customer_design_base(uuid,jsonb,integer) from public,anon,authenticated;
create function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;g jsonb;keep boolean;existing boolean;
begin
 if auth.uid() is null then raise exception 'Sign in as a customer.' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Invalid design fields.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;existing:=found;
 if existing and d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
 g:=case when p_fields ? 'refinement_geometry' then nullif(p_fields->'refinement_geometry','null'::jsonb) else d.refinement_geometry end;
 if g is not null and (not public.valid_refinement_geometry(g) or coalesce(p_fields->>'design_kind','garment')<>'garment' or p_fields->'format_version' is distinct from '3'::jsonb) then raise exception 'Invalid template proportions.' using errcode='22023';end if;
 if p_fields ? 'include_source_reference' and jsonb_typeof(p_fields->'include_source_reference')<>'boolean' then raise exception 'Choose whether to include the sketch reference.' using errcode='22023';end if;
 keep:=coalesce((p_fields->>'include_source_reference')::boolean,d.include_source_reference,false);
 if keep and d.source_reference is null then raise exception 'No linked sketch reference.' using errcode='22023';end if;
 if existing and d.version=coalesce(p_expected_version,0)+1 and (g is distinct from d.refinement_geometry or keep is distinct from d.include_source_reference) then raise exception 'Design changed. Reopen before saving.' using errcode='40001';end if;
 d:=public.save_customer_design_base(p_id,p_fields-array['refinement_geometry','include_source_reference'],p_expected_version);
 update public.customer_designs set refinement_geometry=g,include_source_reference=keep where id=d.id returning * into d;
 return d;
end;$$;

create function public.create_refined_design(p_id uuid,p_source_id uuid,p_source_version integer,p_fields jsonb,p_outline_indices jsonb,p_keep_reference boolean,p_confirm boolean)
returns public.customer_designs language plpgsql security definer set search_path='' as $$
declare s public.customer_designs;d public.customer_designs;ref jsonb;item jsonb;existing boolean;minx numeric;maxx numeric;miny numeric;maxy numeric;
begin
 perform 1 from public.user_roles where user_id=auth.uid() and role='customer' for update;
 if not found then raise exception 'Only customers can refine sketches.' using errcode='42501';end if;
 if p_confirm is distinct from true or p_keep_reference is null or p_id is null or p_id=p_source_id or p_fields->>'design_kind' is distinct from 'garment' or not public.valid_refinement_geometry(p_fields->'refinement_geometry') then raise exception 'Confirm a new template-based garment design.' using errcode='22023';end if;
 if p_fields ?| array['include_source_reference','source_reference'] then raise exception 'Reference data is set by the server.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;existing:=found;
 if existing then
  if d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
  if d.source_reference->>'id' is distinct from p_source_id::text or d.source_reference->>'version' is distinct from p_source_version::text or d.source_reference->'outline_indices' is distinct from p_outline_indices or d.include_source_reference<>p_keep_reference then raise exception 'Refinement retry differs.' using errcode='22023';end if;
  return public.save_customer_design(p_id,p_fields,null);
 end if;
 select * into s from public.customer_designs where id=p_source_id and owner_id=auth.uid() for share;
 if not found or s.design_kind<>'sketch' then raise exception 'Choose one of your saved sketches.' using errcode='42501';end if;
 if s.version is distinct from p_source_version then raise exception 'Sketch changed. Reopen and review the outline.' using errcode='40001';end if;
 if p_outline_indices is null or jsonb_typeof(p_outline_indices)<>'array' then raise exception 'Identify outline strokes.' using errcode='22023';end if;
 if jsonb_array_length(p_outline_indices)<1 or jsonb_array_length(p_outline_indices)>32 then raise exception 'Identify outline strokes.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_outline_indices) loop
  if jsonb_typeof(item)<>'number' then raise exception 'Invalid outline selection.' using errcode='22023';end if;
  if item::text::numeric<0 or item::text::numeric>=jsonb_array_length(s.decorations->'strokes') or trunc(item::text::numeric)<>item::text::numeric then raise exception 'Invalid outline selection.' using errcode='22023';end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(p_outline_indices))<>jsonb_array_length(p_outline_indices) then raise exception 'Repeated outline selection.' using errcode='22023';end if;
 select min((p.value->>0)::numeric),max((p.value->>0)::numeric),min((p.value->>1)::numeric),max((p.value->>1)::numeric) into minx,maxx,miny,maxy
 from jsonb_array_elements(p_outline_indices) i cross join lateral jsonb_array_elements(s.decorations->'strokes'->(i.value::text::numeric::integer)->'points') p;
 if maxx-minx<250 or maxy-miny<250 then raise exception 'Select an outline with width and height.' using errcode='22023';end if;
 d:=public.save_customer_design(p_id,p_fields,null);
 ref:=jsonb_build_object('id',s.id,'version',s.version,'outline_indices',p_outline_indices,'design',to_jsonb(s)-array['id','owner_id','version','created_at','updated_at','attached_at','source_reference','include_source_reference']);
 update public.customer_designs set source_reference=ref,include_source_reference=p_keep_reference where id=d.id returning * into d;
 return d;
end;$$;

create function public.copy_design_refinement_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;
begin
 select * into d from public.customer_designs where id=new.design_id;
 new.refinement_geometry:=d.refinement_geometry;
 new.include_source_reference:=d.include_source_reference;
 new.source_reference:=case when d.include_source_reference then d.source_reference else null end;
 return new;
end;$$;
create trigger copy_design_refinement before insert on public.request_design_snapshots for each row execute function public.copy_design_refinement_snapshot();
revoke all on function public.copy_design_refinement_snapshot(),public.valid_refinement_geometry(jsonb),public.save_customer_design(uuid,jsonb,integer),public.create_refined_design(uuid,uuid,integer,jsonb,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.valid_refinement_geometry(jsonb),public.save_customer_design(uuid,jsonb,integer),public.create_refined_design(uuid,uuid,integer,jsonb,jsonb,boolean,boolean) to authenticated;
commit;
