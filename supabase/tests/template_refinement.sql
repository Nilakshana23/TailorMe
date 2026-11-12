-- Isolated local fixtures; never execute on a hosted project.
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.expect_error(q text,code text) returns void language plpgsql as $$
declare actual text;begin begin execute q;exception when others then get stacked diagnostics actual=returned_sqlstate;if actual<>code then raise exception 'FAIL expected %, got %: %',code,actual,q;end if;return;end;raise exception 'FAIL expected rejection: %',q;end;$$;
insert into auth.users(id) values('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002');
create function pg_temp.refinement_fields(kind text default 'dress') returns jsonb language sql as $$
 select jsonb_build_object('name','Refined garment','design_kind','garment','format_version',3,'garment_type',kind,'colour','ruby',
 'neckline',case when kind in('skirt','trousers') then 'none' else 'round' end,'sleeve',case when kind in('skirt','trousers') then 'none' when kind='shirt' then 'long' else 'short' end,'length','midi',
 'garment_options',case when kind='shirt' then '{"collar":"point"}'::jsonb when kind='trousers' then '{"waist_style":"flat","leg_style":"straight"}'::jsonb when kind in('kurti','salwar_top') then '{"side_slits":"short"}'::jsonb else '{}'::jsonb end,
 'refinement_geometry','{"shoulder":40,"waist":30,"hem":60,"sleeve_width":32,"sleeve_length":120,"waist_y":195,"hem_y":370}'::jsonb,
 'decorations','{"version":2,"strokes":[]}'::jsonb)
$$;
create function pg_temp.refine(n integer,kind text default 'dress',keep boolean default true,consent boolean default true) returns public.customer_designs language sql as $$
 select public.create_refined_design(('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'b3000000-0000-4000-8000-000000000001',1,pg_temp.refinement_fields(kind),'[0]',keep,consent)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Refinement Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select pg_temp.expect_error('select pg_temp.refine(1)','42501');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select public.save_customer_design('b3000000-0000-4000-8000-000000000001','{"name":"Detailed source sketch","design_kind":"sketch","format_version":4,"notes":"Buttons and pleats stay in this reference.","decorations":{"version":2,"strokes":[{"kind":"rectangle","mode":"canvas","colour":"#303039","width":3,"points":[[2000,1000],[8000,9000]]},{"mode":"canvas","colour":"#ff0000","width":2,"points":[[4500,3000],[4600,3100]]}]}}',null);
select pg_temp.expect_error('select pg_temp.refine(1,''dress'',true,false)','22023');
select pg_temp.expect_error($q$select public.create_refined_design('b2000000-0000-4000-8000-000000000099','b3000000-0000-4000-8000-000000000001',2,pg_temp.refinement_fields(),'[0]',true,true)$q$,'40001');
select pg_temp.expect_error($q$select public.create_refined_design('b2000000-0000-4000-8000-000000000099','b3000000-0000-4000-8000-000000000001',1,pg_temp.refinement_fields(),'[9]',true,true)$q$,'22023');
select pg_temp.expect_error($q$select public.create_refined_design('b2000000-0000-4000-8000-000000000099','b3000000-0000-4000-8000-000000000001',1,pg_temp.refinement_fields()||'{"source_reference":{}}','[0]',true,true)$q$,'22023');
select pg_temp.refine(1);select pg_temp.refine(1);
select pg_temp.refine(2,'blouse',false);select pg_temp.refine(3,'skirt');select pg_temp.refine(4,'shirt');select pg_temp.refine(5,'trousers');select pg_temp.refine(6,'kurti');select pg_temp.refine(7,'salwar_top');
select pg_temp.assert_true((select count(*)=8 from public.customer_designs),'all seven templates and original persist; retry creates no duplicate');
select pg_temp.assert_true((select bool_and(source_reference->'outline_indices'='[0]'::jsonb and jsonb_array_length(source_reference->'design'->'decorations'->'strokes')=2) from public.customer_designs where refinement_geometry is not null),'selected outline recorded, complete decorative reference preserved');
select public.save_customer_design('b2000000-0000-4000-8000-000000000002',pg_temp.refinement_fields('blouse')||'{"custom_neckline":{"depths":[65,80,100,80,65]},"refinement_geometry":{"shoulder":42,"waist":32,"hem":70,"sleeve_width":32,"sleeve_length":120,"waist_y":195,"hem_y":380}}',1);
select pg_temp.assert_true((select refinement_geometry->>'shoulder'='42' and custom_neckline is not null and version=2 and not include_source_reference from public.customer_designs where id='b2000000-0000-4000-8000-000000000002'),'save/reopen retains editable geometry, custom neckline and reference choice');
select pg_temp.expect_error($q$select public.save_customer_design('b2000000-0000-4000-8000-000000000002',pg_temp.refinement_fields('blouse')||'{"refinement_geometry":{"shoulder":999}}',2)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design('b2000000-0000-4000-8000-000000000002',pg_temp.refinement_fields('blouse')||'{"include_source_reference":"yes"}',2)$q$,'22023');
select public.send_tailoring_request_with_design('b4000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','dress','Please use this refined reference.',1,current_date+30,'b2000000-0000-4000-8000-000000000001',1);
select public.send_tailoring_request_with_design('b4000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','dress','Please use this refined reference.',1,current_date+30,'b2000000-0000-4000-8000-000000000001',1);
select public.send_tailoring_request_with_measurements('b4000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','blouse','Please use the refined illustration.',1,current_date+30,false,null,null,'b2000000-0000-4000-8000-000000000002',2);
select pg_temp.assert_true((select source_reference is null and not include_source_reference and refinement_geometry->>'shoulder'='42' from public.request_design_snapshots where request_id='b4000000-0000-4000-8000-000000000002'),'excluded private reference is not copied into request');
select pg_temp.expect_error($q$select public.save_customer_design('b2000000-0000-4000-8000-000000000001',pg_temp.refinement_fields()||'{"include_source_reference":false}',1)$q$,'22023');
select public.delete_customer_design('b3000000-0000-4000-8000-000000000001',1);
select pg_temp.refine(1);
select pg_temp.assert_true((select source_reference->'design'->>'name'='Detailed source sketch' from public.customer_designs where id='b2000000-0000-4000-8000-000000000001'),'source deletion preserves provenance copy and exact creation retry');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_designs),'unrelated customer cannot read source reference');
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'unrelated customer cannot read snapshots');
select pg_temp.expect_error('select pg_temp.refine(1)','42501');
select pg_temp.expect_error($q$select public.save_customer_design_base(gen_random_uuid(),pg_temp.refinement_fields(),null)$q$,'42501');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'admin cannot read private participant reference');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=2 from public.request_design_snapshots),'only addressed tailor sees both snapshots');
select pg_temp.assert_true((select source_reference->'design'->>'notes'='Buttons and pleats stay in this reference.' and refinement_geometry=pg_temp.refinement_fields()->'refinement_geometry' from public.request_design_snapshots where request_id='b4000000-0000-4000-8000-000000000001'),'immutable geometry and complete reference survive source deletion');
select pg_temp.expect_error('update public.request_design_snapshots set source_reference=null','42501');
reset role;
select pg_temp.assert_true((select bool_and(refinement_geometry is null and source_reference is null) from public.request_design_snapshots where design_id::text like '84000000%'),'legacy snapshots are untouched');
set local role anon;
select pg_temp.expect_error('select pg_temp.refine(9)','42501');
reset role;rollback;
select 'PASS: template refinement confirmation, seven garments, save/reopen, ownership, retries and immutable reference snapshots' as result;
