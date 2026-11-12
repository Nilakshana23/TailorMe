-- LOCAL PGlite fixtures only. Do not run against a hosted project.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate;
    if actual<>expected then raise exception 'FAIL: expected %, got %: %',expected,actual,statement; end if; return; end;
  raise exception 'FAIL: expected denial: %',statement;
end; $$;
insert into auth.users(id,raw_user_meta_data) values
 ('70000000-0000-4000-8000-000000000001','{"full_name":"Customer One"}'),
 ('70000000-0000-4000-8000-000000000002','{"full_name":"Customer Two"}'),
 ('70000000-0000-4000-8000-000000000003','{"full_name":"Other Tailor"}');
update public.user_roles set role='tailor' where user_id='70000000-0000-4000-8000-000000000003';
create function pg_temp.send(n integer,qty integer default 1,dt date default ((now() at time zone 'Asia/Colombo')::date+30),target uuid default '50000000-0000-4000-8000-000000000002') returns public.tailoring_requests language sql as $$
select public.send_tailoring_request(('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,target,'Dress','A simple linen dress for an event.',qty,dt); $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile('{"shop_name":"Request Atelier","description":"Bespoke garments for special occasions.","specialties":"Dresses","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}',true,1);
select pg_temp.expect_error('select pg_temp.send(1)','42501');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error('select pg_temp.send(1,0)','23514');
select pg_temp.expect_error('select pg_temp.send(1,101)','23514');
select pg_temp.expect_error('select pg_temp.send(1,1,(now() at time zone ''Asia/Colombo'')::date)','22023');
select pg_temp.expect_error($q$select public.send_tailoring_request('71000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','','too short',1,current_date+30)$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.send(1,1,current_date+30,'70000000-0000-4000-8000-000000000003')$q$,'22023');
select pg_temp.expect_error($q$select pg_temp.send(1,1,current_date+30,'50000000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.send(1);
select pg_temp.send(1);
select pg_temp.assert_true((select count(*)=1 from public.tailoring_requests),'retry creates exactly one request');
select pg_temp.assert_true((select customer_id=auth.uid() and customer_name='Customer One' and version=1 and status='pending' from public.tailoring_requests limit 1),'trusted ownership and profile name');
select pg_temp.expect_error('select pg_temp.send(1,2)','22023');
select pg_temp.expect_error('update public.tailoring_requests set status=''accepted''','42501');
select pg_temp.expect_error('delete from public.tailoring_requests','42501');
select pg_temp.expect_error($q$insert into public.tailoring_requests(id,customer_id,tailor_id) values(gen_random_uuid(),auth.uid(),'50000000-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','accepted','',1)$q$,'42501');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.tailoring_requests),'unrelated customer cannot read');
select pg_temp.expect_error('select pg_temp.send(1)','22023');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','cancelled','',1)$q$,'42501');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.tailoring_requests),'unrelated tailor cannot read');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','rejected','No',1)$q$,'42501');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.tailoring_requests),'admin has no request access');
select pg_temp.expect_error('select pg_temp.send(2)','42501');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=1 from public.tailoring_requests),'addressed tailor reads');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','rejected',' ',1)$q$,'22023');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','cancelled','',1)$q$,'42501');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','paid','',1)$q$,'22023');
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','accepted','',1);
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','accepted','',1);
select pg_temp.assert_true((select status='accepted' and version=2 and responded_at is not null from public.tailoring_requests),'acceptance and retry');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','rejected','Changed mind',1)$q$,'40001');
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','rejected','Changed mind',2)$q$,'22023');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.decide_tailoring_request('71000000-0000-4000-8000-000000000001','cancelled','',1)$q$,'40001');
select pg_temp.send(2);
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000002','cancelled','',1);
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000002','cancelled','',1);
select pg_temp.assert_true((select status='cancelled' and cancelled_at is not null and version=2 from public.tailoring_requests where id='71000000-0000-4000-8000-000000000002'),'customer cancellation and retry');
select pg_temp.send(3);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000003','rejected','Cannot meet the preferred timing.',1);
select pg_temp.assert_true((select rejection_reason='Cannot meet the preferred timing.' and status='rejected' from public.tailoring_requests where id='71000000-0000-4000-8000-000000000003'),'rejection reason retained');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.send(4,100);
reset role;
-- Local schema fixtures only: publication changes must not hide participants' requests.
update public.tailor_profiles set is_published=false where owner_id='50000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=4 from public.tailoring_requests),'customer reads after unpublish');
select pg_temp.send(1);
select pg_temp.expect_error('select pg_temp.send(5)','22023');
reset role;
update public.tailor_profiles set is_published=true,accepting_requests=false where owner_id='50000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.expect_error('select pg_temp.send(5)','22023');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=4 from public.tailoring_requests),'tailor reads after availability change');
select public.decide_tailoring_request('71000000-0000-4000-8000-000000000004','accepted','',1);
select pg_temp.assert_true((select status='accepted' from public.tailoring_requests where id='71000000-0000-4000-8000-000000000004'),'existing inquiry can be accepted after unpublication/unavailability');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select * from public.tailoring_requests','42501');
select pg_temp.expect_error('select pg_temp.send(4)','42501');
reset role;
rollback;
select 'PASS: requests authorization, idempotency, transitions, participant access' as result;
