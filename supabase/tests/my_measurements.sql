-- LOCAL fixtures only. Never run this suite on a hosted project.
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.expect_error(q text,code text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute q;exception when others then get stacked diagnostics actual=returned_sqlstate;
 if actual<>code then raise exception 'FAIL expected %, got %: %',code,actual,q;end if;return;end;
 raise exception 'FAIL expected error: %',q;
end;$$;
insert into auth.users(id) values('97000000-0000-4000-8000-000000000001'),('97000000-0000-4000-8000-000000000002');
create function pg_temp.fail_snapshot() returns trigger language plpgsql as $$
begin
 if new.request_id='98000000-0000-4000-8000-000000000004' then raise exception 'Injected snapshot failure' using errcode='23514';end if;
 return new;
end;$$;
create trigger test_snapshot_failure before insert on public.request_measurement_snapshots for each row execute function pg_temp.fail_snapshot();
create function pg_temp.send_measurements(n integer,consent boolean default true,v jsonb default '{"waist":80.01}',qty integer default 1,design uuid default null,dversion integer default null) returns public.tailoring_requests language sql as $$
 select public.send_tailoring_request_with_measurements(('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'50000000-0000-4000-8000-000000000002','dress','A dress with careful fitting.',qty,current_date+30,consent,v,case when v is not null then current_date else null end,design,dversion)
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Measurement Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select pg_temp.expect_error($q$select public.save_customer_measurements('{"waist":80}',current_date)$q$,'42501');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select public.save_customer_measurements('{"waist":80.01}',current_date);
select public.save_customer_measurements('{"waist":80.01}',current_date);
select pg_temp.assert_true((select count(*)=1 from public.customer_measurements),'one editable personal profile');
select pg_temp.expect_error($q$select public.save_customer_measurements('{"photo":"x"}',current_date)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_measurements('{"waist":"NaN"}',current_date)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_measurements('{"waist":80.001}',current_date)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_measurements('{"waist":301}',current_date)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_measurements('{"inseam":0}',current_date)$q$,'22023');
select pg_temp.expect_error($q$select public.save_customer_measurements('{}',current_date+1)$q$,'22023');
select pg_temp.expect_error('select pg_temp.send_measurements(1,false)','22023');
select pg_temp.expect_error('select pg_temp.send_measurements(1,null)','22023');
select pg_temp.expect_error($q$select pg_temp.send_measurements(1,true,'{"waist":81}')$q$,'22023');
select pg_temp.expect_error('select pg_temp.send_measurements(1,true,null)','22023');
select pg_temp.expect_error('select pg_temp.send_measurements(1,true,''{"waist":80.01}'',0)','23514');
select pg_temp.assert_true((select count(*)=0 from public.tailoring_requests where customer_id=auth.uid()),'failed request rolls back');
select pg_temp.assert_true((select count(*)=0 from public.request_measurement_snapshots),'failed request creates no snapshot');
select pg_temp.send_measurements(1);
select pg_temp.send_measurements(1);
select pg_temp.send_measurements(2,false,null);
select public.save_customer_design('99000000-0000-4000-8000-000000000001','{"name":"Dress","garment_type":"dress","colour":"ivory","neckline":"round","sleeve":"short","length":"midi"}',null);
select pg_temp.expect_error($q$select pg_temp.send_measurements(3,true,'{"waist":80.01}',1,'99000000-0000-4000-8000-000000000001',9)$q$,'40001');
select pg_temp.send_measurements(3,true,'{"waist":80.01}',1,'99000000-0000-4000-8000-000000000001',1);
select pg_temp.send_measurements(3,true,'{"waist":80.01}',1,'99000000-0000-4000-8000-000000000001',1);
select public.save_customer_design('99000000-0000-4000-8000-000000000002','{"name":"Atomic dress","garment_type":"dress","colour":"ivory","neckline":"round","sleeve":"short","length":"midi"}',null);
select pg_temp.expect_error($q$select pg_temp.send_measurements(4,true,'{"waist":80.01}',1,'99000000-0000-4000-8000-000000000002',1)$q$,'23514');
select pg_temp.assert_true(not exists(select 1 from public.tailoring_requests where id='98000000-0000-4000-8000-000000000004'),'snapshot failure rolls back inserted request');
select pg_temp.assert_true(not exists(select 1 from public.request_design_snapshots where request_id='98000000-0000-4000-8000-000000000004'),'snapshot failure rolls back design snapshot');
select pg_temp.assert_true((select attached_at is null from public.customer_designs where id='99000000-0000-4000-8000-000000000002'),'snapshot failure rolls back design attachment lock');
select pg_temp.assert_true((select count(*)=1 from public.request_design_snapshots where request_id::text like '98000000%'),'combined design snapshot preserved exactly once');
select pg_temp.assert_true((select count(*)=2 and bool_and(snapshot_version=1 and consented_at is not null) from public.request_measurement_snapshots),'consent and version recorded once');
select pg_temp.expect_error('select pg_temp.send_measurements(1,false,null)','22023');
select public.save_customer_measurements('{"waist":90}',current_date);
select pg_temp.send_measurements(1);
delete from public.customer_measurements;
select pg_temp.send_measurements(1);
select pg_temp.assert_true((select bool_and(values_cm='{"waist":80.01}'::jsonb) from public.request_measurement_snapshots),'edit/delete and retries do not change snapshots');
select pg_temp.expect_error('update public.request_measurement_snapshots set values_cm=''{}''','42501');
select pg_temp.expect_error('delete from public.request_measurement_snapshots','42501');
select public.save_customer_measurements('{"waist":90}',current_date);
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_measurements),'other customer cannot read profile through API');
select pg_temp.assert_true((select count(*)=0 from public.request_measurement_snapshots),'other customer cannot read snapshots');
delete from public.customer_measurements;
reset role;
update public.user_roles set role='tailor' where user_id='97000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.request_measurement_snapshots),'unrelated tailor cannot read snapshots');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.request_measurement_snapshots),'admin is not a participant');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_measurements),'addressed tailor cannot read personal profile');
select pg_temp.assert_true((select count(*)=2 from public.request_measurement_snapshots),'addressed tailor can read request snapshots');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from public.customer_measurements),'other customer deletion has no effect');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.request_measurement_snapshots where request_id::text like '80000000%'),'legacy requests remain valid without measurements');
set local role anon;
select pg_temp.expect_error('select * from public.customer_measurements','42501');
select pg_temp.expect_error('select * from public.request_measurement_snapshots','42501');
reset role;
rollback;
select 'PASS: measurement ownership, validation, consent, atomic design snapshots, retries and legacy requests' as result;
