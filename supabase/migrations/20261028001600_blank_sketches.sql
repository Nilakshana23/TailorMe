-- Additive sketch and artwork v2 support. Historical rows and migrations remain intact.
begin;
create function public.drawing_cross(a jsonb,b jsonb,c jsonb) returns numeric language sql immutable set search_path='' as $$
 select ((b->>0)::numeric-(a->>0)::numeric)*((c->>1)::numeric-(a->>1)::numeric)-((b->>1)::numeric-(a->>1)::numeric)*((c->>0)::numeric-(a->>0)::numeric)
$$;
create function public.valid_closed_drawing(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare n integer:=jsonb_array_length(p);i integer;j integer;a jsonb;b jsonb;c jsonb;d jsonb;area numeric:=0;x numeric;y numeric;z numeric;t numeric;
begin
 if n>3 and p->0=p->(n-1) then n:=n-1;end if;
 if n<3 or n>256 then return false;end if;
 for i in 0..n-1 loop
  a:=p->i;b:=p->((i+1)%n);if a=b then return false;end if;
  area:=area+(a->>0)::numeric*(b->>1)::numeric-(b->>0)::numeric*(a->>1)::numeric;
  for j in i+2..n-1 loop
   if i=0 and j=n-1 then continue;end if;
   c:=p->j;d:=p->((j+1)%n);
   if greatest((a->>0)::numeric,(b->>0)::numeric)<least((c->>0)::numeric,(d->>0)::numeric) or greatest((c->>0)::numeric,(d->>0)::numeric)<least((a->>0)::numeric,(b->>0)::numeric) or greatest((a->>1)::numeric,(b->>1)::numeric)<least((c->>1)::numeric,(d->>1)::numeric) or greatest((c->>1)::numeric,(d->>1)::numeric)<least((a->>1)::numeric,(b->>1)::numeric) then continue;end if;
   x:=public.drawing_cross(a,b,c);y:=public.drawing_cross(a,b,d);z:=public.drawing_cross(c,d,a);t:=public.drawing_cross(c,d,b);
   if x*y<0 and z*t<0 then return false;end if;
   if (x=0 and (c->>0)::numeric between least((a->>0)::numeric,(b->>0)::numeric) and greatest((a->>0)::numeric,(b->>0)::numeric) and (c->>1)::numeric between least((a->>1)::numeric,(b->>1)::numeric) and greatest((a->>1)::numeric,(b->>1)::numeric)) or
      (y=0 and (d->>0)::numeric between least((a->>0)::numeric,(b->>0)::numeric) and greatest((a->>0)::numeric,(b->>0)::numeric) and (d->>1)::numeric between least((a->>1)::numeric,(b->>1)::numeric) and greatest((a->>1)::numeric,(b->>1)::numeric)) or
      (z=0 and (a->>0)::numeric between least((c->>0)::numeric,(d->>0)::numeric) and greatest((c->>0)::numeric,(d->>0)::numeric) and (a->>1)::numeric between least((c->>1)::numeric,(d->>1)::numeric) and greatest((c->>1)::numeric,(d->>1)::numeric)) or
      (t=0 and (b->>0)::numeric between least((c->>0)::numeric,(d->>0)::numeric) and greatest((c->>0)::numeric,(d->>0)::numeric) and (b->>1)::numeric between least((c->>1)::numeric,(d->>1)::numeric) and greatest((c->>1)::numeric,(d->>1)::numeric)) then return false;end if;
  end loop;
 end loop;
 return abs(area)>=100;
end;$$;
revoke all on function public.drawing_cross(jsonb,jsonb,jsonb),public.valid_closed_drawing(jsonb) from public,anon;
grant execute on function public.drawing_cross(jsonb,jsonb,jsonb),public.valid_closed_drawing(jsonb) to authenticated;
create or replace function public.valid_design_drawing(art jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb;pts jsonb;p jsonb;n jsonb;total integer:=0;legacy boolean;w numeric;kind text;closed boolean;
begin
 if art is null or jsonb_typeof(art)<>'object' or octet_length(art::text)>98304 or (art-array['version','strokes'])<>'{}'::jsonb then return false;end if;
 if art->'version' not in('1'::jsonb,'2'::jsonb) or not(art ? 'version') or jsonb_typeof(art->'strokes') is distinct from 'array' then return false;end if;
 legacy:=art->>'version'='1';if jsonb_array_length(art->'strokes')>32 then return false;end if;
 for s in select value from jsonb_array_elements(art->'strokes') loop
  if jsonb_typeof(s)<>'object' or not(s ?& array['colour','width','points']) then return false;end if;
  if (s-(case when legacy then array['colour','width','points','mode'] else array['colour','width','points','mode','kind','closed','fill'] end))<>'{}'::jsonb then return false;end if;
  if jsonb_typeof(s->'colour')<>'string' or jsonb_typeof(s->'width')<>'number' then return false;end if;
  if legacy then
   if s->>'colour' not in('#303039','#f3e6ce','#a8324a','#243c63','#789783','#b08d35') then return false;end if;
  elsif s->>'colour' !~ '^#[0-9a-fA-F]{6}$' then return false;end if;
  if s ? 'mode' and (jsonb_typeof(s->'mode')<>'string' or s->>'mode' not in('garment','canvas')) then return false;end if;
  w:=(s->>'width')::numeric;if w<1 or w>12 or trunc(w)<>w then return false;end if;
  pts:=s->'points';if jsonb_typeof(pts)<>'array' then return false;end if;
  if jsonb_array_length(pts)<2 or jsonb_array_length(pts)>256 then return false;end if;
  total:=total+jsonb_array_length(pts);if total>4096 then return false;end if;
  for p in select value from jsonb_array_elements(pts) loop
   if jsonb_typeof(p)<>'array' then return false;end if;
   if jsonb_array_length(p)<>2 then return false;end if;
   for n in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(n)<>'number' then return false;end if;
    if n::text::numeric<0 or n::text::numeric>10000 or trunc(n::text::numeric)<>n::text::numeric then return false;end if;
   end loop;
  end loop;
  if not legacy then
   if s ? 'kind' and (jsonb_typeof(s->'kind')<>'string' or s->>'kind' not in('stroke','rectangle','ellipse')) then return false;end if;
   if s ? 'closed' and jsonb_typeof(s->'closed')<>'boolean' then return false;end if;
   if s ? 'fill' and s->'fill'<>'null'::jsonb and (jsonb_typeof(s->'fill')<>'string' or s->>'fill' !~ '^#[0-9a-fA-F]{6}$') then return false;end if;
   kind:=coalesce(s->>'kind','stroke');closed:=coalesce((s->>'closed')::boolean,false);
   if kind in('rectangle','ellipse') then
    if jsonb_array_length(pts)<>2 or pts->0->0=pts->1->0 or pts->0->1=pts->1->1 then return false;end if;
   elsif closed then
    if not public.valid_closed_drawing(pts) then return false;end if;
   elsif nullif(s->'fill','null'::jsonb) is not null then return false;end if;
  end if;
 end loop;
 return true;
end;$$;
create function public.valid_design_header(k text,f integer,g text,n text,s text,o jsonb,c jsonb,nt text,cat text,shade text,art jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if k is null or k not in('garment','sketch') or nt is null or char_length(nt)>2000 then return false;end if;
 if cat is not null and cat not in('dress','blouse','skirt','shirt','trousers','kurti','salwar_top') then return false;end if;
 if shade is not null and shade !~ '^#[0-9a-fA-F]{6}$' then return false;end if;
 if k='garment' then return cat is null and public.valid_garment_design(g,n,s,f,o,c);end if;
 return f=4 and g='dress' and n='none' and s='none' and o='{}'::jsonb and c is null and shade is null and art->'version'='2'::jsonb and not exists(select 1 from jsonb_array_elements(art->'strokes') item where item->>'mode' is distinct from 'canvas');
end;$$;
revoke all on function public.valid_design_header(text,integer,text,text,text,jsonb,jsonb,text,text,text,jsonb) from public,anon;
grant execute on function public.valid_design_header(text,integer,text,text,text,jsonb,jsonb,text,text,text,jsonb) to authenticated;
alter table public.customer_designs add column design_kind text not null default 'garment',add column notes text not null default '',add column sketch_category text,add column garment_fill text;
alter table public.request_design_snapshots add column design_kind text not null default 'garment',add column notes text not null default '',add column sketch_category text,add column garment_fill text;
alter table public.customer_designs drop constraint customer_garment_options,add constraint customer_design_header check(public.valid_design_header(design_kind,format_version,garment_type,neckline,sleeve,garment_options,custom_neckline,notes,sketch_category,garment_fill,decorations));
alter table public.request_design_snapshots drop constraint snapshot_garment_options,add constraint snapshot_design_header check(public.valid_design_header(design_kind,format_version,garment_type,neckline,sleeve,garment_options,custom_neckline,notes,sketch_category,garment_fill,decorations));
create or replace function public.save_customer_design(p_id uuid,p_fields jsonb,p_expected_version integer) returns public.customer_designs
language plpgsql security definer set search_path='' as $$
declare d public.customer_designs;trusted_role text;fmt integer;geometry jsonb;options jsonb;art jsonb;kind text;nt text;cat text;shade text;
begin
 select role into trusted_role from public.user_roles where user_id=auth.uid() for share;
 if auth.uid() is null or trusted_role is distinct from 'customer' then raise exception 'Only signed-in customers can save designs.' using errcode='42501';end if;
 if p_id is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or(p_fields-array['name','garment_type','colour','neckline','sleeve','length','format_version','custom_neckline','garment_options','decorations','design_kind','notes','sketch_category','garment_fill'])<>'{}'::jsonb then raise exception 'Choose supported design options.' using errcode='22023';end if;
 if octet_length(p_fields::text)>131072 then raise exception 'Design data is too large.' using errcode='22023';end if;
 kind:=coalesce(p_fields->>'design_kind','garment');nt:=p_fields->>'notes';cat:=p_fields->>'sketch_category';shade:=p_fields->>'garment_fill';
 if kind not in('garment','sketch') or (p_fields ? 'design_kind' and jsonb_typeof(p_fields->'design_kind')<>'string') or (p_fields ? 'notes' and jsonb_typeof(p_fields->'notes')<>'string') or (p_fields ? 'sketch_category' and jsonb_typeof(p_fields->'sketch_category') not in('string','null')) or (p_fields ? 'garment_fill' and jsonb_typeof(p_fields->'garment_fill') not in('string','null')) then raise exception 'Invalid design metadata.' using errcode='22023';end if;
 if kind='sketch' then
  if p_fields ? 'name' and jsonb_typeof(p_fields->'name')<>'string' then raise exception 'Design title must be text.' using errcode='22023';end if;
  p_fields:=p_fields||jsonb_build_object('name',coalesce(nullif(btrim(p_fields->>'name'),''),'Untitled sketch'));
  if (p_fields ? 'format_version' and p_fields->'format_version'<>'4'::jsonb) or nullif(p_fields->'custom_neckline','null'::jsonb) is not null or shade is not null then raise exception 'Sketches do not use template geometry or garment fill.' using errcode='22023';end if;
  p_fields:=p_fields||'{"garment_type":"dress","colour":"ivory","neckline":"none","sleeve":"none","length":"midi","format_version":4,"custom_neckline":null,"garment_options":{}}';
 end if;
 if p_fields ? 'format_version' and (jsonb_typeof(p_fields->'format_version')<>'number' or p_fields->>'format_version' not in ('1','2','3','4')) then raise exception 'Unsupported design format.' using errcode='22023';end if;
 fmt:=coalesce((p_fields->>'format_version')::integer,1);
 geometry:=nullif(p_fields->'custom_neckline','null'::jsonb);
 if geometry is not null and (fmt not in(2,3) or p_fields->>'garment_type' in('skirt','trousers') or not public.valid_custom_neckline(geometry)) then raise exception 'Invalid custom neckline geometry.' using errcode='22023';end if;
 art:=p_fields->'decorations';
 if art is not null and not public.valid_design_drawing(art) then raise exception 'Invalid or oversized decorative drawing.' using errcode='22023';end if;
 options:=coalesce(p_fields->'garment_options','{}'::jsonb);
 if kind='garment' and not public.valid_garment_design(p_fields->>'garment_type',p_fields->>'neckline',p_fields->>'sleeve',fmt,options,geometry) then raise exception 'Unsupported garment options or custom geometry.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_fields-array['format_version','custom_neckline','garment_options','decorations','sketch_category','garment_fill']) where jsonb_typeof(value)<>'string') then raise exception 'Design options must be text values.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 select * into d from public.customer_designs where id=p_id for update;
 if found then
  art:=coalesce(art,d.decorations);nt:=coalesce(nt,d.notes);
  if not(p_fields ? 'sketch_category') then cat:=d.sketch_category;end if;
  if not(p_fields ? 'garment_fill') then shade:=d.garment_fill;end if;
  if d.owner_id<>auth.uid() then raise exception 'Design unavailable.' using errcode='42501';end if;
 if not public.valid_design_header(kind,fmt,p_fields->>'garment_type',p_fields->>'neckline',p_fields->>'sleeve',options,geometry,coalesce(nt,''),cat,shade,coalesce(art,case when kind='sketch' then '{"version":2,"strokes":[]}'::jsonb else '{"version":1,"strokes":[]}'::jsonb end)) then raise exception 'Invalid design mode, category, notes or artwork.' using errcode='22023';end if;
  if d.version=coalesce(p_expected_version,0)+1 and d.name=btrim(p_fields->>'name') and d.garment_type=p_fields->>'garment_type' and d.colour=p_fields->>'colour' and d.neckline=p_fields->>'neckline' and d.sleeve=p_fields->>'sleeve' and d.length=p_fields->>'length' and d.design_kind=kind and d.notes=coalesce(nt,'') and d.sketch_category is not distinct from cat and d.garment_fill is not distinct from shade and d.decorations=art and d.garment_options=options and d.format_version=fmt and d.custom_neckline is not distinct from geometry then return d;end if;
  if d.version is distinct from p_expected_version then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
  if d.attached_at is not null or exists(select 1 from public.request_design_snapshots where design_id=d.id) then raise exception 'Attached designs are read-only. Create a new design to make changes.' using errcode='22023';end if;
  update public.customer_designs set design_kind=kind,notes=coalesce(nt,''),sketch_category=cat,garment_fill=shade,name=btrim(p_fields->>'name'),garment_type=p_fields->>'garment_type',colour=p_fields->>'colour',neckline=p_fields->>'neckline',sleeve=p_fields->>'sleeve',length=p_fields->>'length',decorations=art,garment_options=options,format_version=fmt,custom_neckline=geometry,version=version+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 else
  if p_expected_version is not null then raise exception 'Design changed. Reopen it before saving.' using errcode='40001';end if;
 if not public.valid_design_header(kind,fmt,p_fields->>'garment_type',p_fields->>'neckline',p_fields->>'sleeve',options,geometry,coalesce(nt,''),cat,shade,coalesce(art,case when kind='sketch' then '{"version":2,"strokes":[]}'::jsonb else '{"version":1,"strokes":[]}'::jsonb end)) then raise exception 'Invalid design mode, category, notes or artwork.' using errcode='22023';end if;
  insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline,garment_options,decorations,design_kind,notes,sketch_category,garment_fill) values(p_id,auth.uid(),btrim(p_fields->>'name'),p_fields->>'garment_type',p_fields->>'colour',p_fields->>'neckline',p_fields->>'sleeve',p_fields->>'length',fmt,geometry,options,coalesce(art,case when kind='sketch' then '{"version":2,"strokes":[]}'::jsonb else '{"version":1,"strokes":[]}'::jsonb end),kind,coalesce(nt,''),cat,shade) returning * into d;
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
 if (d.design_kind='garment' and btrim(p_garment_type) is distinct from d.garment_type) or (d.design_kind='sketch' and d.sketch_category is not null and btrim(p_garment_type) is distinct from d.sketch_category) then raise exception 'Request garment must match the selected design.' using errcode='22023';end if;
 r:=public.send_tailoring_request(p_id,p_tailor_id,p_garment_type,p_description,p_quantity,p_preferred_date);
 insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline,garment_options,decorations,design_kind,notes,sketch_category,garment_fill)
 values(r.id,d.id,d.version,d.name,d.garment_type,d.colour,d.neckline,d.sleeve,d.length,d.format_version,d.custom_neckline,d.garment_options,d.decorations,d.design_kind,d.notes,d.sketch_category,d.garment_fill);
 update public.customer_designs set attached_at=coalesce(attached_at,clock_timestamp()) where id=d.id;
 return r;
end;$$;
revoke all on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.send_tailoring_request_with_design(uuid,uuid,text,text,integer,date,uuid,integer) to authenticated;
commit;
