-- Legacy strokes without mode remain On garment. Existing JSON is untouched.
begin;
create or replace function public.valid_design_drawing(art jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare stroke jsonb; pts jsonb; p jsonb; n jsonb; total integer:=0; width numeric;
begin
 if art is null or jsonb_typeof(art)<>'object' or octet_length(art::text)>98304 then return false;end if;
 if (art-array['version','strokes'])<>'{}'::jsonb or art->'version' is distinct from '1'::jsonb then return false;end if;
 if jsonb_typeof(art->'strokes') is distinct from 'array' then return false;end if;
 if jsonb_array_length(art->'strokes')>32 then return false;end if;
 for stroke in select value from jsonb_array_elements(art->'strokes') loop
  if jsonb_typeof(stroke)<>'object' or (stroke-array['colour','width','points','mode'])<>'{}'::jsonb or not(stroke ?& array['colour','width','points']) then return false;end if;
  if jsonb_typeof(stroke->'colour')<>'string' or stroke->>'colour' not in('#303039','#f3e6ce','#a8324a','#243c63','#789783','#b08d35') or jsonb_typeof(stroke->'width')<>'number' then return false;end if;
  if stroke ? 'mode' and (jsonb_typeof(stroke->'mode')<>'string' or stroke->>'mode' not in('garment','canvas')) then return false;end if;
  width:=(stroke->>'width')::numeric;
  if width<1 or width>12 or trunc(width)<>width then return false;end if;
  pts:=stroke->'points';if jsonb_typeof(pts)<>'array' then return false;end if;
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
 end loop;
 return true;
end;$$;
revoke all on function public.valid_design_drawing(jsonb) from public,anon;
grant execute on function public.valid_design_drawing(jsonb) to authenticated;
commit;
