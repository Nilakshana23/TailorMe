-- LOCAL fixtures, run only after the full migration chain including 015 and 016.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;
  if actual<>expected then raise exception 'FAIL: expected %, got %: %',expected,actual,statement;end if;return;end;
 raise exception 'FAIL: expected denial: %',statement;
end;$$;
insert into auth.users(id,raw_user_meta_data) values
 ('94000000-0000-4000-8000-000000000001','{"full_name":"Sketch Customer"}'),
 ('94000000-0000-4000-8000-000000000002','{"full_name":"Other Customer"}'),
 ('94000000-0000-4000-8000-000000000003','{"full_name":"Other Tailor"}');
update public.user_roles set role='tailor' where user_id='94000000-0000-4000-8000-000000000003';
create function pg_temp.sketch_fields(category text default null) returns jsonb language sql as $$
 select jsonb_build_object('design_kind','sketch','format_version',4,'name','Customer sketch','notes','Use this filled border and outline as a reference.','sketch_category',category,'decorations',
 '{"version":2,"strokes":[{"kind":"rectangle","mode":"canvas","colour":"#123ABC","width":4,"fill":"#FEDCBA","points":[[0,0],[10000,10000]]},{"kind":"ellipse","mode":"canvas","colour":"#ff00aa","width":2,"fill":null,"points":[[2000,2000],[5000,7000]]},{"mode":"canvas","colour":"#303039","width":3,"points":[[100,100],[9000,9000]]}]}'::jsonb)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Sketch Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000001',pg_temp.sketch_fields(),null)$q$,'42501');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
select public.save_customer_design('95000000-0000-4000-8000-000000000001',pg_temp.sketch_fields('kurti'),null);
select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields(),null);
select pg_temp.assert_true((select count(*)=2 from public.customer_designs),'owner can reopen both complete sketches');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields()||'{"svg":"<svg/>"}',1)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.sketch_fields(),'{decorations,strokes,0,fill}','"url(evil)"'),1)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.sketch_fields(),'{decorations,strokes,0,colour}','"#fff"'),1)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields()||'{"photo":"private","alignment":{"x":50}}',1)$q$,'22023');
select pg_temp.expect_error($q$select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','blouse','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000001',1)$q$,'22023');
select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','kurti','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000001',1);
select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','kurti','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000001',1);
select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields()||'{"notes":"Revised before submission"}',1);
select pg_temp.expect_error($q$select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','Custom outfit','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000002',1)$q$,'40001');
select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','Custom outfit','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000002',2);
select pg_temp.assert_true((select count(*)=2 from public.request_design_snapshots),'retry creates exactly one snapshot per request');
select pg_temp.assert_true((select bool_and(design_kind='sketch' and format_version=4 and decorations=pg_temp.sketch_fields()->'decorations') from public.request_design_snapshots),'customer sees complete ordered artwork with fills and colours');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields(),2)$q$,'22023');
select pg_temp.expect_error($q$select public.delete_customer_design('95000000-0000-4000-8000-000000000002',2)$q$,'22023');
select pg_temp.expect_error('update public.request_design_snapshots set notes=''tampered''','42501');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_designs),'unrelated customer cannot read source sketches');
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'unrelated customer cannot read snapshots');
select pg_temp.expect_error($q$select public.save_customer_design('95000000-0000-4000-8000-000000000002',pg_temp.sketch_fields(),2)$q$,'42501');
select pg_temp.expect_error($q$select public.send_tailoring_request_with_design('96000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002','Custom outfit','Please follow this reference.',1,current_date+30,'95000000-0000-4000-8000-000000000002',2)$q$,'42501');
select set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'unrelated tailor cannot read snapshots');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'admin has no participant snapshot access');
reset role;
-- Trusted local-maintenance demonstration only; normal customers cannot mutate attached designs.
update public.customer_designs set notes='Later source edit',name='Later title',decorations='{"version":2,"strokes":[]}',version=version+1 where id::text like '95000000%';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_designs),'addressed tailor cannot read private source sketches');
select pg_temp.assert_true((select count(*)=2 and bool_and(name='Customer sketch' and decorations=pg_temp.sketch_fields()->'decorations') from public.request_design_snapshots),'addressed tailor sees unchanged combined references');
select pg_temp.assert_true((select notes='Revised before submission' and design_version=2 and sketch_category is null from public.request_design_snapshots where request_id='96000000-0000-4000-8000-000000000002'),'snapshot keeps notes category and the submitted version');
select pg_temp.expect_error('delete from public.request_design_snapshots','42501');
select pg_temp.expect_error('update public.request_design_snapshots set decorations=''{}''','42501');
reset role;
select pg_temp.assert_true((select bool_and(design_kind='garment' and format_version in(1,2,3)) from public.customer_designs where id::text like '84000000%'),'legacy source formats remain garment designs');
select pg_temp.assert_true((select bool_and(design_kind='garment' and format_version in(1,2,3)) from public.request_design_snapshots where design_id::text like '84000000%'),'historical snapshot formats preserved');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select * from public.customer_designs','42501');
select pg_temp.expect_error('select * from public.request_design_snapshots','42501');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.sketch_fields(),null)$q$,'42501');
reset role;
rollback;
select 'PASS: complete categorized/uncategorized sketch sharing, authorization and immutable legacy-safe snapshots' as result;
