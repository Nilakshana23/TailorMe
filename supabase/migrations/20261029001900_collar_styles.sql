begin;
-- Null means a pre-collar-control row: retain any explicit legacy shirt collar.
-- Designs with no legacy collar render as None. No historical snapshots are rewritten.
create function public.valid_collar_design(k text,g text,n text,c jsonb,style text,shade text) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if style is null then return shade is null;end if;
 if style not in('none','shirt','stand','peter_pan') then return false;end if;
 if style='none' then return shade is null;end if;
 if k is distinct from 'garment' or g is null or g not in('dress','blouse','shirt','kurti','salwar_top') or n is distinct from 'round' or c is not null then return false;end if;
 return shade is null or shade ~ '^#[0-9a-fA-F]{6}$';
end;$$;
alter table public.customer_designs add column collar_style text,add column collar_colour text,
 add constraint design_collar_options check(public.valid_collar_design(design_kind,garment_type,neckline,custom_neckline,collar_style,collar_colour));
alter table public.request_design_snapshots add column collar_style text,add column collar_colour text,
 add constraint snapshot_collar_options check(public.valid_collar_design(design_kind,garment_type,neckline,custom_neckline,collar_style,collar_colour));

alter function public.save_customer_design(uuid,jsonb,integer) rename to save_customer_design_refinement;
revoke all on function public.save_customer_design_refinement(uuid,jsonb,integer) from public,anon,authenticated;
create function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;style text;shade text;existing boolean;k text;g text;n text;c jsonb;o jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in as a customer.' using errcode='42501';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Invalid design fields.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;existing:=found;
 if existing and d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
 if (p_fields ? 'collar_style' and jsonb_typeof(p_fields->'collar_style') not in('string','null')) or (p_fields ? 'collar_colour' and jsonb_typeof(p_fields->'collar_colour') not in('string','null')) then raise exception 'Choose a supported collar and colour.' using errcode='22023';end if;
 style:=case when p_fields ? 'collar_style' then p_fields->>'collar_style' else d.collar_style end;
 shade:=case when p_fields ? 'collar_colour' then p_fields->>'collar_colour' else d.collar_colour end;
 k:=coalesce(p_fields->>'design_kind','garment');g:=p_fields->>'garment_type';n:=p_fields->>'neckline';c:=nullif(p_fields->'custom_neckline','null'::jsonb);o:=coalesce(p_fields->'garment_options',d.garment_options,'{}'::jsonb);
 if not public.valid_collar_design(k,g,n,c,style,shade) then raise exception 'Collars need a round preset neckline on a top garment. Choose None for V, square or custom necklines; use #RRGGBB for a separate collar colour.' using errcode='22023';end if;
 if style is not null and g='shirt' and o->>'collar' is distinct from 'none' then raise exception 'Use the separate Collar style control; legacy shirt collar must be None.' using errcode='22023';end if;
 if existing and d.version=coalesce(p_expected_version,0)+1 and (style is distinct from d.collar_style or shade is distinct from d.collar_colour) then raise exception 'Design changed. Reopen before saving.' using errcode='40001';end if;
 -- Clear only within this transaction, so an explicit collar removal can change
 -- the neckline without violating the old row's collar constraint mid-save.
 if existing then update public.customer_designs set collar_style=null,collar_colour=null where id=p_id;end if;
 d:=public.save_customer_design_refinement(p_id,p_fields-array['collar_style','collar_colour'],p_expected_version);
 update public.customer_designs set collar_style=style,collar_colour=shade where id=d.id returning * into d;
 return d;
end;$$;

create function public.copy_design_collar_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;
begin
 select * into d from public.customer_designs where id=new.design_id;
 new.collar_style:=d.collar_style;new.collar_colour:=d.collar_colour;return new;
end;$$;
create trigger copy_design_collar before insert on public.request_design_snapshots for each row execute function public.copy_design_collar_snapshot();
revoke all on function public.copy_design_collar_snapshot(),public.valid_collar_design(text,text,text,jsonb,text,text),public.save_customer_design(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.valid_collar_design(text,text,text,jsonb,text,text),public.save_customer_design(uuid,jsonb,integer) to authenticated;
commit;
