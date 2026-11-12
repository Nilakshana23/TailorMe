-- Local fixtures only; no hosted database.
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.expect_error(q text,code text) returns void language plpgsql as $$declare actual text;begin begin execute q;exception when others then get stacked diagnostics actual=returned_sqlstate;if actual<>code then raise exception 'FAIL expected %, got %: %',code,actual,q;end if;return;end;raise exception 'FAIL expected rejection: %',q;end;$$;
insert into auth.users(id) values('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002');
create function pg_temp.collar_fields(kind text default 'dress',style text default 'shirt',shade text default '#ABC123') returns jsonb language sql as $$
 select jsonb_build_object('name','Collared garment','design_kind','garment','format_version',3,'garment_type',kind,'colour','ruby','neckline',case when kind in('skirt','trousers') then 'none' else 'round' end,'sleeve',case when kind in('skirt','trousers') then 'none' else 'long' end,'length','midi','collar_style',style,'collar_colour',shade,
 'garment_options',case when kind='shirt' then '{"collar":"none"}'::jsonb when kind='trousers' then '{"waist_style":"flat","leg_style":"straight"}'::jsonb when kind in('kurti','salwar_top') then '{"side_slits":"short"}'::jsonb else '{}'::jsonb end,
 'decorations','{"version":2,"strokes":[{"mode":"canvas","colour":"#303039","width":3,"points":[[100,100],[500,500]]}]}'::jsonb)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Collar Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
do $$declare k text;s text;i integer:=0;d public.customer_designs;begin
 foreach k in array array['dress','blouse','shirt','kurti','salwar_top'] loop foreach s in array array['shirt','stand','peter_pan'] loop
 i:=i+1;d:=public.save_customer_design(('c2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,pg_temp.collar_fields(k,s),null);
 perform pg_temp.assert_true(d.collar_style=s and d.collar_colour='#ABC123','all top/collar combinations save and reopen');end loop;end loop;end;$$;
select public.save_customer_design('c2000000-0000-4000-8000-000000000001',pg_temp.collar_fields(),null);
select pg_temp.assert_true((select count(*)=15 from public.customer_designs),'retry creates no duplicate');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields('skirt'),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields('trousers'),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields()||'{"neckline":"v"}',null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields()||'{"custom_neckline":{"depths":[65,80,100,80,65]}}',null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields('dress','unknown'),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields('dress','none'),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields('dress','stand','url(evil)'),null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields()||'{"collar_style":{}}',null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields()||'{"collar_colour":99}',null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.collar_fields()||'{"extra":"unsupported"}',null)$q$,'22023');
-- Explicit removal can safely return to a custom cut in one save transaction.
select public.save_customer_design('c2000000-0000-4000-8000-000000000001',pg_temp.collar_fields('dress','none',null)||'{"custom_neckline":{"depths":[65,80,100,80,65]}}',1);
select pg_temp.assert_true((select collar_style='none' and collar_colour is null and custom_neckline is not null from public.customer_designs where id='c2000000-0000-4000-8000-000000000001'),'custom neckline remains editable without collar');
select pg_temp.expect_error($q$select public.save_customer_design('c2000000-0000-4000-8000-000000000001',pg_temp.collar_fields(),1)$q$,'40001');
select public.save_customer_design('c3000000-0000-4000-8000-000000000001','{"name":"Original sketch","design_kind":"sketch","format_version":4,"decorations":{"version":2,"strokes":[{"kind":"rectangle","mode":"canvas","colour":"#303039","width":3,"points":[[2000,1000],[8000,9000]]}]}}',null);
select public.create_refined_design('c2000000-0000-4000-8000-000000000050','c3000000-0000-4000-8000-000000000001',1,pg_temp.collar_fields('dress','peter_pan',null)||'{"refinement_geometry":{"shoulder":40,"waist":30,"hem":60,"sleeve_width":32,"sleeve_length":120,"waist_y":195,"hem_y":370}}','[0]',true,true);
select public.send_tailoring_request_with_measurements('c4000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','dress','Please use this collar and reference.',1,current_date+30,false,null,null,'c2000000-0000-4000-8000-000000000050',1);
select public.send_tailoring_request_with_measurements('c4000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','dress','Please use this collar and reference.',1,current_date+30,false,null,null,'c2000000-0000-4000-8000-000000000050',1);
select pg_temp.assert_true((select collar_style='peter_pan' and collar_colour is null and refinement_geometry is not null and source_reference is not null and jsonb_array_length(decorations->'strokes')=1 from public.request_design_snapshots),'snapshot includes collar, match colour, geometry, drawing and original reference atomically');
select pg_temp.expect_error($q$select public.save_customer_design('c2000000-0000-4000-8000-000000000050',pg_temp.collar_fields('dress','shirt'),1)$q$,'22023');
select pg_temp.assert_true((select collar_style='peter_pan' from public.customer_designs where id='c2000000-0000-4000-8000-000000000050'),'rejected attached edit rolls back temporary collar clearing');
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_designs),'other customer cannot see collar designs');
select pg_temp.expect_error($q$select public.save_customer_design('c2000000-0000-4000-8000-000000000002',pg_temp.collar_fields('dress','stand'),1)$q$,'42501');
select pg_temp.expect_error($q$select public.save_customer_design_refinement(gen_random_uuid(),pg_temp.collar_fields(),null)$q$,'42501');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select collar_style='peter_pan' and source_reference is not null from public.request_design_snapshots),'addressed tailor sees collar with immutable reference');
select pg_temp.expect_error('update public.request_design_snapshots set collar_style=''none''','42501');
reset role;
select pg_temp.assert_true((select bool_and(collar_style is null and collar_colour is null) from public.request_design_snapshots where design_id::text like '84000000%'),'historical snapshots were not rewritten');
select pg_temp.assert_true((select garment_options->>'collar'='point' and collar_style is null from public.customer_designs where id='84000000-0000-4000-8000-000000000003'),'explicit legacy shirt collar preserved');
rollback;
select 'PASS: collar compatibility, colour validation, save/reopen, custom cuts, refinement, snapshots and legacy rows' as result;
