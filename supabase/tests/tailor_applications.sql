-- Run as postgres after BOTH migrations. No real accounts are changed.
-- Uses throwaway Auth fixtures and rolls every change back. Run the whole file.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', label; end if; end;
$$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then raise exception 'FAIL: expected %, got % for %', expected_state, actual_state, statement; end if;
    return;
  end;
  raise exception 'FAIL: expected denial (%) for %', expected_state, statement;
end;
$$;

insert into auth.users (id, raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001', '{"full_name":"Application Customer","role":"admin"}'),
 ('20000000-0000-4000-8000-000000000002', '{"full_name":"Other Customer"}'),
 ('20000000-0000-4000-8000-000000000003', '{"full_name":"Reviewing Admin"}'),
 ('20000000-0000-4000-8000-000000000004', '{"full_name":"Existing Tailor"}'),
 ('20000000-0000-4000-8000-000000000005', '{"full_name":"Promoted Admin"}');
update public.user_roles set role = 'admin' where user_id = '20000000-0000-4000-8000-000000000003';
update public.user_roles set role = 'tailor' where user_id = '20000000-0000-4000-8000-000000000004';

set local role anon;
select pg_temp.expect_error('select * from public.tailor_applications', '42501');
select pg_temp.expect_error($q$select public.save_tailor_application('','','','','','',null,false,null)$q$, '42501');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,1)$q$, '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- Empty drafts are valid. Incomplete submissions, invalid fields are not.
select public.save_tailor_application('','','','','','',null,false,null);
select pg_temp.assert_true((select status = 'draft' and version = 1 from public.tailor_applications), 'initial draft');
select pg_temp.expect_error($q$select public.save_tailor_application('','','','','','',null,true,1)$q$, '23514');
select pg_temp.expect_error($q$select public.save_tailor_application('Shop','+94112223344','Colombo','123 Main Street','A professional tailoring studio.','Suits',-1,false,1)$q$, '23514');
select pg_temp.expect_error($q$select public.save_tailor_application(repeat('x',161),'','','','','',null,false,1)$q$, '23514');
select pg_temp.expect_error($q$select public.save_tailor_application('Shop','invalid','Colombo','123 Main Street','A professional tailoring studio.','Suits',2,true,1)$q$, '23514');
select pg_temp.assert_true((select version = 1 and status = 'draft' from public.tailor_applications), 'failed submit rolled back');
select pg_temp.expect_error($q$select public.save_tailor_application('Shop','','','','','',null,false,null)$q$, '40001');
-- Raw table writes, protected fields, role writes and unauthorized RPCs fail.
select pg_temp.expect_error($q$insert into public.tailor_applications (applicant_id) values ('20000000-0000-4000-8000-000000000002')$q$, '42501');
select pg_temp.expect_error($q$update public.tailor_applications set applicant_id = '20000000-0000-4000-8000-000000000002'$q$, '42501');
select pg_temp.expect_error($q$update public.tailor_applications set status = 'approved', reviewer_id = auth.uid(), reviewed_at = now()$q$, '42501');
select pg_temp.expect_error($q$update public.tailor_applications set version = 99, created_at = now()$q$, '42501');
select pg_temp.expect_error($q$delete from public.tailor_applications$q$, '42501');
select pg_temp.expect_error($q$update public.user_roles set role = 'admin' where user_id = auth.uid()$q$, '42501');
select pg_temp.expect_error($q$select public.review_tailor_application(auth.uid(),'approved',null,1)$q$, '42501');
select public.save_tailor_application('Atelier One','+94112223344','Colombo','123 Main Street','A professional tailoring studio.','Suits, alterations',5,true,1);
select pg_temp.assert_true((select status = 'pending' and version = 2 from public.tailor_applications), 'complete submission');
select pg_temp.expect_error($q$select public.save_tailor_application('Edited','','','','','',null,false,2)$q$, '22023');

-- Another customer cannot see or mutate the first customer's application.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.tailor_applications), 'cross-customer read isolation');
select pg_temp.expect_error($q$update public.tailor_applications set shop_name = 'Attack' where applicant_id = '20000000-0000-4000-8000-000000000001'$q$, '42501');
select public.save_tailor_application('Other Shop','+94112223344','Kandy','123 Main Street','A professional tailoring studio.','Bridal',2,true,null);
select pg_temp.assert_true((select count(*) = 1 from public.tailor_applications), 'one visible application per customer');

-- Tailors cannot apply or review, but can still read their own historical row.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.tailor_applications), 'tailor cannot read others');
select pg_temp.expect_error($q$select public.save_tailor_application('','','','','','',null,false,null)$q$, '42501');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,2)$q$, '42501');

-- Admin sees applications through nonrecursive RLS, not other users' profiles.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) = 2 from public.tailor_applications where applicant_id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002')), 'admin read access');
select pg_temp.expect_error($q$select public.save_tailor_application('','','','','','',null,false,null)$q$, '42501');
select pg_temp.expect_error($q$update public.tailor_applications set status = 'rejected'$q$, '42501');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','draft',null,2)$q$, '22023');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','rejected','   ',2)$q$, '22023');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','rejected',chr(9)||chr(10),2)$q$, '22023');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved','No',2)$q$, '22023');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,1)$q$, '40001');
select public.review_tailor_application('20000000-0000-4000-8000-000000000001','rejected','Please provide more detail.',2);
select pg_temp.assert_true((select status = 'rejected' and reviewer_id = auth.uid() and reviewed_at is not null and rejection_reason = 'Please provide more detail.' and version = 3 from public.tailor_applications where applicant_id = '20000000-0000-4000-8000-000000000001'), 'rejection audit');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,3)$q$, '22023');

-- Rejection leaves customer role unchanged. Editing rejected -> draft clears audit.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select role = 'customer' from public.user_roles where user_id = auth.uid()), 'rejection preserves customer');
select public.save_tailor_application('','','','','','',null,false,3);
select pg_temp.assert_true((select status = 'draft' and reviewer_id is null and reviewed_at is null and rejection_reason is null and version = 4 from public.tailor_applications), 'rejected application saved as draft');
select public.save_tailor_application('Atelier One','+94112223344','Colombo','123 Main Street','A professional tailoring studio with new details.','Suits, alterations',6,true,4);
select pg_temp.assert_true((select version = 5 and status = 'pending' from public.tailor_applications), 'resubmission');

-- Stale review after resubmission cannot approve a different revision.
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,2)$q$, '40001');
-- Force a failure AFTER the RPC changes user_roles, to prove both writes roll back.
reset role;
create function pg_temp.fail_approval_for_test() returns trigger language plpgsql as $$
begin raise exception 'Simulated storage failure' using errcode = '23514'; end;
$$;
create trigger test_fail_approval after update on public.tailor_applications
  for each row when (new.status = 'approved') execute function pg_temp.fail_approval_for_test();
set local role authenticated;
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,5)$q$, '23514');
reset role;
select pg_temp.assert_true((select role = 'customer' from public.user_roles where user_id = '20000000-0000-4000-8000-000000000001'), 'failed approval rolls back role change');
select pg_temp.assert_true((select status = 'pending' and version = 5 from public.tailor_applications where applicant_id = '20000000-0000-4000-8000-000000000001'), 'failed approval rolls back application');
drop trigger test_fail_approval on public.tailor_applications;
set local role authenticated;
select public.review_tailor_application('20000000-0000-4000-8000-000000000001','approved',null,5);
select pg_temp.assert_true((select status = 'approved' and version = 6 and reviewer_id = auth.uid() and reviewed_at is not null and rejection_reason is null from public.tailor_applications where applicant_id = '20000000-0000-4000-8000-000000000001'), 'approval audit');
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000001','rejected','Again',6)$q$, '22023');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select role = 'tailor' from public.user_roles where user_id = auth.uid()), 'approval atomically promotes customer');
select pg_temp.assert_true((select status = 'approved' from public.tailor_applications), 'approved applicant can still read own application');
select pg_temp.expect_error($q$select public.save_tailor_application('','','','','','',null,false,6)$q$, '42501');

-- Database trigger invariants hold even for owner table writes.
reset role;
select pg_temp.expect_error($q$update public.tailor_applications set status = 'draft', reviewer_id = null, reviewed_at = null where applicant_id = '20000000-0000-4000-8000-000000000001'$q$, '23514');
select pg_temp.expect_error($q$update public.tailor_applications set shop_name = 'Changed', status = 'approved', reviewer_id = '20000000-0000-4000-8000-000000000003', reviewed_at = now() where applicant_id = '20000000-0000-4000-8000-000000000002'$q$, '23514');
select pg_temp.expect_error($q$update public.tailor_applications set applicant_id = '20000000-0000-4000-8000-000000000005' where applicant_id = '20000000-0000-4000-8000-000000000002'$q$, '23514');
select pg_temp.expect_error($q$insert into public.tailor_applications (applicant_id) values ('20000000-0000-4000-8000-000000000002')$q$, '23505');

-- An owner-promoted admin with an old pending application can NEVER be demoted.
update public.user_roles set role = 'admin' where user_id = '20000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.expect_error($q$select public.review_tailor_application('20000000-0000-4000-8000-000000000002','approved',null,1)$q$, '22023');
select pg_temp.expect_error($q$select public.review_tailor_application(auth.uid(),'approved',null,1)$q$, '22023');
reset role;
select pg_temp.assert_true((select role = 'admin' from public.user_roles where user_id = '20000000-0000-4000-8000-000000000002'), 'admin role preserved');
select pg_temp.assert_true((select status = 'pending' and reviewer_id is null from public.tailor_applications where applicant_id = '20000000-0000-4000-8000-000000000002'), 'failed approval leaves application unchanged');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.save_tailor_application(text,text,text,text,text,text,integer,boolean,integer)', 'EXECUTE'), 'anon save denied');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.review_tailor_application(uuid,text,text,integer)', 'EXECUTE'), 'anon review denied');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.tailorme_application_transition()', 'EXECUTE'), 'internal trigger function not exposed');
rollback;
select 'PASS: tailor application authorization and workflow; all fixtures rolled back' as result;
