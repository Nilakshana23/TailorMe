begin;
create table public.customer_designs (
 id uuid primary key,owner_id uuid not null references auth.users(id),name text not null check(char_length(btrim(name)) between 1 and 100),
 garment_type text not null check(garment_type in('dress','blouse','skirt')),
 colour text not null check(colour in('ruby','navy','sage','ivory','black')),
 neckline text not null check(neckline in('round','v','square','none')),
 sleeve text not null check(sleeve in('sleeveless','short','long','none')),
 length text not null check(length in('short','midi','long')),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),attached_at timestamptz,
 check((garment_type='skirt' and neckline='none' and sleeve='none') or(garment_type<>'skirt' and neckline<>'none' and sleeve<>'none'))
);
alter table public.customer_designs enable row level security;
revoke all on public.customer_designs from public,anon,authenticated;
grant select on public.customer_designs to authenticated;
create policy design_owner_read on public.customer_designs for select to authenticated using(owner_id=(select auth.uid()));
create table public.request_design_snapshots (
 request_id uuid primary key references public.tailoring_requests(id),design_id uuid not null references public.customer_designs(id),design_version integer not null,
 name text not null,garment_type text not null,colour text not null,neckline text not null,sleeve text not null,length text not null,created_at timestamptz not null default now()
);
alter table public.request_design_snapshots enable row level security;
revoke all on public.request_design_snapshots from public,anon,authenticated;
grant select on public.request_design_snapshots to authenticated;
create policy request_design_participants on public.request_design_snapshots for select to authenticated using(exists(select 1 from public.tailoring_requests r where r.id=request_id and auth.uid() in(r.customer_id,r.tailor_id)));
create function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs
language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 if auth.uid() is null or trusted_role is distinct from 'customer' then raise exception 'Only signed-in customers can save designs.' using errcode='42501';end if;
 if p_id is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or(p_fields-array['name','garment_type','colour','neckline','sleeve','length'])<>'{}'::jsonb then raise exception 'Choose supported design options.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_fields) where jsonb_typeof(value)<>'string') then raise exception 'Design options must be text values.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;
 if found then
  if d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
  if d.version=coalesce(p_expected_version,0)+1 and d.name=btrim(p_fields->>'name') and d.garment_type=p_fields->>'garment_type' and d.colour=p_fields->>'colour' and d.neckline=p_fields->>'neckline' and d.sleeve=p_fields->>'sleeve' and d.length=p_fields->>'length' then return d;end if;
  if d.version is distinct from p_expected_version then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
  if d.attached_at is not null or exists(select 1 from public.request_design_snapshots where design_id=d.id) then raise exception 'Attached designs are read-only. Create a new design to make changes.' using errcode='22023';end if;
  update public.customer_designs set name=btrim(p_fields->>'name'),garment_type=p_fields->>'garment_type',colour=p_fields->>'colour',neckline=p_fields->>'neckline',sleeve=p_fields->>'sleeve',length=p_fields->>'length',version=version+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 else
  if p_expected_version is not null then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
  insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length) values(p_id,auth.uid(),btrim(p_fields->>'name'),p_fields->>'garment_type',p_fields->>'colour',p_fields->>'neckline',p_fields->>'sleeve',p_fields->>'length') returning * into d;
 end if;
 return d;
end;$$;
revoke all on function public.save_customer_design(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_customer_design(uuid,jsonb,integer) to authenticated;
create function public.delete_customer_design(p_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;trusted_role text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 if auth.uid() is null or trusted_role is distinct from 'customer' then raise exception 'Only customers can delete their designs.' using errcode='42501';end if;
 select * into d from public.customer_designs where id=p_id and owner_id=auth.uid() for update;
 if not found then return;end if;
 if d.version is distinct from p_expected_version then raise exception 'Design changed. Reopen it before deleting.' using errcode='40001';end if;
 if d.attached_at is not null or exists(select 1 from public.request_design_snapshots where design_id=d.id) then raise exception 'Attached designs cannot be deleted.' using errcode='22023';end if;
 delete from public.customer_designs where id=d.id;
end;$$;
revoke all on function public.delete_customer_design(uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_customer_design(uuid,integer) to authenticated;
create function public.send_tailoring_request_with_design(p_id uuid,p_tailor_id uuid,p_garment_type text,p_description text,p_quantity integer,p_preferred_date date,p_design_id uuid,p_design_version integer)
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
 insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length)
 values(r.id,d.id,d.version,d.name,d.garment_type,d.colour,d.neckline,d.sleeve,d.length);
 update public.customer_designs set attached_at=coalesce(attached_at,clock_timestamp()) where id=d.id;
 return r;
end;$$;
revoke all on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) to authenticated;
commit;
