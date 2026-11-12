-- LOCAL fixture only. Uses actual deterministic browser output supplied by the test runner.
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
insert into auth.users(id) values('a1000000-0000-4000-8000-000000000001');
create function pg_temp.cleanup_fields(art jsonb) returns jsonb language sql as $$
 select jsonb_build_object('design_kind','sketch','format_version',4,'name','Line cleanup test','notes','Local structured artwork','decorations',art)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Sketch Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.save_customer_design('a2000000-0000-4000-8000-000000000001',pg_temp.cleanup_fields(current_setting('test.cleanup_original')::jsonb),null);
select public.save_customer_design('a2000000-0000-4000-8000-000000000001',pg_temp.cleanup_fields(current_setting('test.cleanup_result')::jsonb),1);
select pg_temp.assert_true((select decorations=current_setting('test.cleanup_result')::jsonb and version=2 and format_version=4 from public.customer_designs where id='a2000000-0000-4000-8000-000000000001'),'cleaned structured artwork saves and reopens unchanged with existing format');
select public.send_tailoring_request_with_design('a3000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','Custom sketch','Please follow this line reference.',1,current_date+30,'a2000000-0000-4000-8000-000000000001',2);
select pg_temp.expect_error($q$select public.save_customer_design('a2000000-0000-4000-8000-000000000001',pg_temp.cleanup_fields(current_setting('test.cleanup_original')::jsonb),2)$q$,'22023');
select public.save_customer_design('a2000000-0000-4000-8000-000000000002',pg_temp.cleanup_fields(current_setting('test.cleanup_original')::jsonb),null);
select public.save_customer_design('a2000000-0000-4000-8000-000000000002',pg_temp.cleanup_fields(current_setting('test.cleanup_result')::jsonb),1);
select pg_temp.assert_true((select decorations=current_setting('test.cleanup_result')::jsonb and design_version=2 from public.request_design_snapshots where request_id='a3000000-0000-4000-8000-000000000001'),'later work on a new design never rewrites submitted snapshot');
reset role;
-- Trusted local maintenance proves snapshots hold copied artwork, not a source reference.
update public.customer_designs set decorations=current_setting('test.cleanup_original')::jsonb where id='a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select decorations=current_setting('test.cleanup_result')::jsonb from public.request_design_snapshots where request_id='a3000000-0000-4000-8000-000000000001'),'addressed tailor reopens unchanged snapshot after source modification');
reset role;
select pg_temp.assert_true((select bool_and(decorations->>'version'='1') from public.request_design_snapshots where design_id::text like '84000000%'),'legacy artwork snapshots stay version 1');
rollback;
select 'PASS: actual cleanup output saves/reopens, shares immutable snapshots and preserves legacy artwork' as result;
