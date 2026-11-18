begin;
-- Prerequisite: migrations 001–028, in chronological order. No historical rows rewritten.
create function public.valid_back_neckline(b jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if b is null then return true;end if;
 if jsonb_typeof(b)<>'object' then return false;end if;
 if (select count(*) from jsonb_object_keys(b))<>4 or not b ?& array['version','preset','depth','width'] then return false;end if;
 if b->'version'<>'1'::jsonb or jsonb_typeof(b->'preset')<>'string' or b->>'preset' not in('round','v','square') or jsonb_typeof(b->'depth')<>'number' or jsonb_typeof(b->'width')<>'number' then return false;end if;
 return (b->>'depth')::numeric between 4 and 45 and (b->>'width')::numeric between 20 and 42;
end;$$;
alter table public.customer_designs add column back_neckline jsonb,
 add constraint design_back_neckline check(public.valid_back_neckline(back_neckline) and (back_neckline is null or (design_kind='garment' and garment_type='dress')));
alter table public.request_design_snapshots add column back_neckline jsonb,
 add constraint snapshot_back_neckline check(public.valid_back_neckline(back_neckline) and (back_neckline is null or (design_kind='garment' and garment_type='dress')));
alter function public.save_customer_design(uuid,jsonb,integer) rename to save_customer_design_before_back;
revoke all on function public.save_customer_design_before_back(uuid,jsonb,integer) from public,anon,authenticated;
create function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;b jsonb;existing boolean;
begin
 if auth.uid() is null then raise exception 'Sign in.' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Invalid design fields.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;existing:=found;
 if existing and d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
 b:=case when p_fields ? 'back_neckline' then nullif(p_fields->'back_neckline','null'::jsonb) else d.back_neckline end;
 if not public.valid_back_neckline(b) or (b is not null and (coalesce(p_fields->>'design_kind','garment')<>'garment' or p_fields->>'garment_type' is distinct from 'dress')) then raise exception 'Invalid back neckline preset or dimensions.' using errcode='22023';end if;
 if existing and d.version=coalesce(p_expected_version,0)+1 and b is distinct from d.back_neckline then raise exception 'Design changed. Reopen before saving.' using errcode='40001';end if;
 -- Existing authorization, attached-design locks, validation and retry checks remain authoritative.
 -- Temporary clearing is transactional; a failed inner save rolls the whole operation back.
 if existing then update public.customer_designs set back_neckline=null where id=p_id;end if;
 d:=public.save_customer_design_before_back(p_id,p_fields-'back_neckline',p_expected_version);
 update public.customer_designs set back_neckline=b where id=d.id returning * into d;
 return d;
end;$$;
create function public.copy_design_back_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select d.back_neckline into new.back_neckline from public.customer_designs d where d.id=new.design_id;
 return new;
end;$$;
create trigger copy_design_back before insert on public.request_design_snapshots for each row execute function public.copy_design_back_snapshot();
revoke all on function public.valid_back_neckline(jsonb),public.copy_design_back_snapshot(),public.save_customer_design(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.valid_back_neckline(jsonb),public.save_customer_design(uuid,jsonb,integer) to authenticated;
commit;
