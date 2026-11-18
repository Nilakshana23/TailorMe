begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.expect_error(q text,code text) returns void language plpgsql as $$declare actual text;begin begin execute q;exception when others then get stacked diagnostics actual=returned_sqlstate;if actual<>code then raise exception 'FAIL expected %, got %: %',code,actual,q;end if;return;end;raise exception 'FAIL expected rejection: %',q;end;$$;
insert into auth.users(id) values('d1000000-0000-4000-8000-000000000001'),('d1000000-0000-4000-8000-000000000002');
create function pg_temp.back_fields() returns jsonb language sql as $$select '{"name":"Independent back","design_kind":"garment","format_version":3,"garment_type":"dress","colour":"ruby","neckline":"v","sleeve":"long","length":"midi","back_neckline":{"version":1,"preset":"square","depth":32,"width":40}}'::jsonb$$;
select pg_temp.assert_true(public.valid_back_neckline(null),'legacy null accepted');
do $$declare b jsonb;begin
 foreach b in array array['{}','[]','{"version":2,"preset":"round","depth":20,"width":34}','{"version":1,"preset":"custom","depth":20,"width":34}','{"version":1,"preset":"v","depth":"NaN","width":34}','{"version":1,"preset":"v","depth":46,"width":34}','{"version":1,"preset":"v","depth":20,"width":19}','{"version":1,"preset":"v","depth":20,"width":34,"extra":1}']::jsonb[] loop
 perform pg_temp.assert_true(not public.valid_back_neckline(b),'invalid back data rejected');end loop;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Back Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select public.save_customer_design('d2000000-0000-4000-8000-000000000001',pg_temp.back_fields(),null);
select public.save_customer_design('d2000000-0000-4000-8000-000000000001',pg_temp.back_fields(),null);
select pg_temp.assert_true((select version=1 and neckline='v' and sleeve='long' and back_neckline->>'preset'='square' from public.customer_designs),'save/reopen and retry retain independent front/back and sleeves');
select pg_temp.expect_error($q$select public.save_customer_design('d2000000-0000-4000-8000-000000000001',pg_temp.back_fields()||'{"back_neckline":{"version":1,"preset":"round","depth":20,"width":34}}',null)$q$,'40001');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.back_fields()||'{"back_neckline":{"version":1,"preset":"round","depth":99,"width":34}}',null)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_design(gen_random_uuid(),pg_temp.back_fields()||'{"garment_type":"blouse"}',null)$q$,'22023');
select public.send_tailoring_request_with_measurements('d4000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','dress','Please use this back neckline.',1,current_date+30,false,null,null,'d2000000-0000-4000-8000-000000000001',1);
select pg_temp.assert_true((select back_neckline=pg_temp.back_fields()->'back_neckline' and neckline='v' and sleeve='long' from public.request_design_snapshots),'new snapshot contains back and sleeves');
select pg_temp.expect_error($q$select public.save_customer_design('d2000000-0000-4000-8000-000000000001',pg_temp.back_fields()||'{"back_neckline":null}',1)$q$,'22023');
select pg_temp.assert_true((select back_neckline is not null from public.customer_designs where id='d2000000-0000-4000-8000-000000000001'),'failed attached edit rolls back clearing');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.request_design_snapshots),'unrelated account cannot read snapshot');
select pg_temp.expect_error($q$select public.save_customer_design('d2000000-0000-4000-8000-000000000001',pg_temp.back_fields(),1)$q$,'42501');
select pg_temp.expect_error($q$select public.save_customer_design_before_back(gen_random_uuid(),pg_temp.back_fields(),null)$q$,'42501');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select back_neckline=pg_temp.back_fields()->'back_neckline' from public.request_design_snapshots),'provider reads same immutable back');
select pg_temp.expect_error('update public.request_design_snapshots set back_neckline=null','42501');
reset role;
select pg_temp.assert_true((select bool_and(back_neckline is null) from public.request_design_snapshots where design_id::text like '84000000%'),'legacy snapshots unchanged');
rollback;

select 'PASS: independent back neckline validation, owner save/retry, immutable participant snapshots and legacy defaults' as result;
