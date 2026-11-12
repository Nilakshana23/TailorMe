-- Ephemeral PGlite fixtures only: run BEFORE migration 004 by npm test.
begin;
insert into auth.users(id,raw_user_meta_data) values
 ('50000000-0000-4000-8000-000000000001','{"full_name":"Legacy pending"}'),
 ('50000000-0000-4000-8000-000000000002','{"full_name":"Legacy approved"}'),
 ('50000000-0000-4000-8000-000000000003','{"full_name":"Fixture admin"}');
update public.user_roles set role='admin' where user_id='50000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
select public.save_tailor_application('Legacy Atelier','+94112223344','Colombo','123 Main Street','A long established tailoring business.','Suits',5,true,null);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
select public.save_tailor_application('Existing Atelier','+94112223344','Kandy','123 Main Street','A long established tailoring business.','Suits',5,true,null);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select public.review_tailor_application('50000000-0000-4000-8000-000000000002','approved',null,1);
reset role;
commit;
