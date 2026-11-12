-- LOCAL FIXTURES ONLY, npm test. Never manipulate hosted Storage files with SQL.
-- Legacy fixtures were created BEFORE migration 004, not backfilled/fabricated.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end;
$$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then raise exception 'FAIL: expected %, got % for %',expected_state,actual_state,statement; end if;
    return;
  end;
  raise exception 'FAIL: expected denial (%) for %',expected_state,statement;
end;
$$;
create function pg_temp.shop_fields() returns jsonb language sql as $$
  select '{"shop_name":"No Photo Atelier","description":"A bespoke atelier with thoughtful details.","specialties":"Suits","city":"Colombo","public_address":"123 Public Street","business_phone":"+94112223344","years_experience":5,"accepting_requests":true}'::jsonb;
$$;
select pg_temp.assert_true((select not public and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] from storage.buckets where id='tailor-application-certificates'),'private bucket limits');
select pg_temp.assert_true((select status='pending' from public.tailor_applications where applicant_id='50000000-0000-4000-8000-000000000001'),'legacy pending preserved');
select pg_temp.assert_true((select status='approved' from public.tailor_applications where applicant_id='50000000-0000-4000-8000-000000000002'),'legacy approval preserved');
select pg_temp.assert_true((select count(*)=0 from public.tailor_application_qualifications),'no fabricated legacy qualifications');
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select public.review_tailor_application('50000000-0000-4000-8000-000000000001','approved',null,1);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
select public.initialize_tailor_profile();
select public.save_tailor_profile(pg_temp.shop_fields(),true,1);
select pg_temp.assert_true((select is_published and cover_path is null from public.tailor_profiles where owner_id=auth.uid()),'publish with no public photos');
select pg_temp.assert_true((select count(*)=0 from public.tailor_portfolio where owner_id=auth.uid()),'no forced portfolio');
insert into storage.objects(bucket_id,name) values('tailor-public','50000000-0000-4000-8000-000000000001/cover/50000000-0000-4000-8000-000000000010.jpg');
select public.set_tailor_cover('50000000-0000-4000-8000-000000000001/cover/50000000-0000-4000-8000-000000000010.jpg',2);
select public.set_tailor_cover(null,3);
select pg_temp.assert_true((select is_published and cover_path is null from public.tailor_profiles where owner_id=auth.uid()),'cover removal keeps publication');
reset role;
insert into auth.users(id,raw_user_meta_data) values
 ('60000000-0000-4000-8000-000000000001','{"full_name":"New Applicant","role":"admin"}'),
 ('60000000-0000-4000-8000-000000000002','{"full_name":"Other Applicant"}'),
 ('60000000-0000-4000-8000-000000000003','{"full_name":"Other Tailor"}');
update public.user_roles set role='tailor' where user_id='60000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.save_tailor_application('New Shop','+94112223344','Colombo','123 Main Street','A bespoke tailoring business.','Suits',5,true,null)$q$,'23514');
select public.save_tailor_application('','','','','','',null,false,null);
select pg_temp.assert_true((select status='draft' from public.tailor_applications where applicant_id=auth.uid()),'draft without evidence');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000002/certificates/60000000-0000-4000-8000-000000000010.jpg',1,'Tailoring course','Craft Institute','NVQ 4')$q$,'42501');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.jpg',1,'Tailoring course','Craft Institute','NVQ 4')$q$,'22023');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-application-certificates','60000000-0000-4000-8000-000000000002/certificates/60000000-0000-4000-8000-000000000010.jpg')$q$,'42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.svg')$q$,'42501');
insert into storage.objects(bucket_id,name,metadata)
  select 'tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-'||lpad(n::text,12,'0')||'.jpg','{"mimetype":"image/jpeg","size":1000}' from generate_series(10,13) n;
insert into storage.objects(bucket_id,name,metadata) values
 ('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000014.png','{"mimetype":"image/svg+xml","size":100}'),
 ('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000015.png','{"mimetype":"image/png","size":5242881}');
insert into storage.objects(bucket_id,name,metadata,created_at) values
 ('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000016.png','{"mimetype":"image/png","size":1000}',now()-interval '2 hours');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000014.png',1,'Tailoring course','Craft Institute','NVQ 4')$q$,'22023');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000015.png',1,'Tailoring course','Craft Institute','NVQ 4')$q$,'22023');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.jpg',1,'','Institute','')$q$,'23514');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.jpg',1,'Course',null,'')$q$,'23502');
insert into storage.objects(bucket_id,name,metadata) values('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000090.pdf','{"mimetype":"application/pdf","size":5242880}');
select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000090.pdf',1,'PDF Course','Institute','');
select public.remove_application_qualification((select id from public.tailor_application_qualifications where file_path like '%.pdf'),1);
select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.jpg',1,'Tailoring course','Craft Institute','NVQ 4');
select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000011.jpg',1,'Tailoring course','Craft Institute','NVQ 4');
select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000012.jpg',1,'Tailoring course','Craft Institute','NVQ 4');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000013.jpg',1,'Tailoring course','Craft Institute','NVQ 4')$q$,'22023');
select pg_temp.expect_error($q$update public.tailor_application_qualifications set applicant_id='60000000-0000-4000-8000-000000000002'$q$,'42501');
select pg_temp.expect_error('delete from public.tailor_application_qualifications','42501');
select pg_temp.expect_error($q$select public.remove_application_qualification((select id from public.tailor_application_qualifications limit 1),99)$q$,'40001');
select public.remove_application_qualification((select id from public.tailor_application_qualifications where file_path like '%000000000012.jpg'),1);
with removed as (delete from storage.objects where name like '%000000000012.jpg' and bucket_id='tailor-application-certificates' returning name)
select pg_temp.assert_true((select count(*)=1 from removed),'detached draft file removable');
select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000013.jpg',1,'Tailoring course','Craft Institute','NVQ 4');

select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=0 from public.tailor_application_qualifications),'other customer cannot read evidence metadata');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='tailor-application-certificates'),'other customer cannot sign/download evidence');
select public.save_tailor_application('','','','','','',null,false,null);
select pg_temp.expect_error($q$select public.remove_application_qualification('60000000-0000-4000-8000-000000000099',1)$q$,'42501');
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.tailor_application_qualifications),'other tailor cannot read metadata');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='tailor-application-certificates'),'other tailor cannot read private objects');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select id from public.tailor_application_qualifications','42501');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='tailor-application-certificates'),'anonymous cannot read private objects');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=3 from public.tailor_application_qualifications),'admin can read attached evidence');
select pg_temp.assert_true((select count(*)=3 from storage.objects where bucket_id='tailor-application-certificates'),'admin cannot read unattached private files');
select pg_temp.expect_error($q$select public.remove_application_qualification((select id from public.tailor_application_qualifications limit 1),1)$q$,'42501');

select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name,metadata) values('tailor-application-evidence','60000000-0000-4000-8000-000000000001/work/60000000-0000-4000-8000-000000000080.jpg','{"mimetype":"image/jpeg","size":1000}');
select public.add_application_evidence('60000000-0000-4000-8000-000000000001/work/60000000-0000-4000-8000-000000000080.jpg',1);
select public.save_tailor_application('New Shop','+94112223344','Colombo','123 Main Street','A bespoke tailoring business.','Suits',5,true,1);
select pg_temp.expect_error($q$select public.remove_application_qualification((select id from public.tailor_application_qualifications limit 1),2)$q$,'22023');
select pg_temp.expect_error($q$select public.add_application_qualification('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000014.png',2,'Tailoring course','Craft Institute','NVQ 4')$q$,'22023');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-application-certificates','60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000099.jpg')$q$,'42501');
with removed as (delete from storage.objects where bucket_id='tailor-application-certificates' and name like '%000000000010.jpg' returning name)
select pg_temp.assert_true((select count(*)=0 from removed),'pending evidence file protected');
with changed as (update storage.objects set name=name where bucket_id='tailor-application-certificates' returning name)
select pg_temp.assert_true((select count(*)=0 from changed),'private files cannot be overwritten');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select public.review_tailor_application('60000000-0000-4000-8000-000000000001','rejected','Please show the finished garment more clearly.',2);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select public.remove_application_qualification((select id from public.tailor_application_qualifications where file_path like '%000000000013.jpg'),3);
select pg_temp.assert_true((select rejection_reason='Please show the finished garment more clearly.' from public.tailor_applications where applicant_id=auth.uid()),'editing photos retains rejection reason');
select public.save_tailor_application('New Shop','+94112223344','Colombo','123 Main Street','A bespoke tailoring business with clearer photos.','Suits',5,true,3);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select public.review_tailor_application('60000000-0000-4000-8000-000000000001','approved',null,4);
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select role='tailor' from public.user_roles where user_id=auth.uid()),'approval promotes atomically');
select pg_temp.assert_true((select status='approved' and reviewer_id='50000000-0000-4000-8000-000000000003' and reviewed_at is not null from public.tailor_applications where applicant_id=auth.uid()),'approval audit retained');
select pg_temp.assert_true((select count(*)=1 from public.unused_application_qualification_uploads()),'orphan discovery remains scoped and excludes attached evidence');
with removed as (delete from storage.objects where bucket_id='tailor-application-certificates' and name in (select path from public.unused_application_qualification_uploads()) returning name)
select pg_temp.assert_true((select count(*)=1 from removed),'only own old unreferenced work photo can be cleaned');
select pg_temp.expect_error($q$select public.remove_application_qualification((select id from public.tailor_application_qualifications limit 1),5)$q$,'42501');
with removed as (delete from storage.objects where bucket_id='tailor-application-certificates' and name like '%000000000010.jpg' returning name)
select pg_temp.assert_true((select count(*)=0 from removed),'approved evidence file protected');
select public.initialize_tailor_profile();
select pg_temp.assert_true((select count(*)=0 from public.tailor_portfolio where owner_id=auth.uid()),'private photos never copied to portfolio');
select pg_temp.expect_error($q$select public.add_tailor_portfolio('60000000-0000-4000-8000-000000000001/certificates/60000000-0000-4000-8000-000000000010.jpg','Copy private evidence')$q$,'42501');

-- A missing underlying object blocks submission rather than claiming evidence.
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
insert into storage.objects(bucket_id,name,metadata) values('tailor-application-certificates','60000000-0000-4000-8000-000000000002/certificates/60000000-0000-4000-8000-000000000020.png','{"mimetype":"image/png","size":1000}');
select public.add_application_qualification('60000000-0000-4000-8000-000000000002/certificates/60000000-0000-4000-8000-000000000020.png',1,'Tailoring course','Craft Institute','NVQ 4');
insert into storage.objects(bucket_id,name,metadata) values('tailor-application-evidence','60000000-0000-4000-8000-000000000002/work/60000000-0000-4000-8000-000000000080.jpg','{"mimetype":"image/jpeg","size":1000}');
select public.add_application_evidence('60000000-0000-4000-8000-000000000002/work/60000000-0000-4000-8000-000000000080.jpg',1);
reset role;
delete from storage.objects where bucket_id='tailor-application-certificates' and name like '60000000-0000-4000-8000-000000000002/%';
set local role authenticated;
select pg_temp.expect_error($q$select public.save_tailor_application('Other Shop','+94112223344','Colombo','123 Main Street','A bespoke tailoring business.','Suits',5,true,1)$q$,'22023');

select public.remove_application_qualification((select id from public.tailor_application_qualifications where applicant_id=auth.uid()),1);
select public.save_tailor_application('Other Shop','+94112223344','Colombo','123 Main Street','A bespoke tailoring business.','Suits',5,true,1);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',true);
select public.review_tailor_application('60000000-0000-4000-8000-000000000002','approved',null,2);
select pg_temp.assert_true((select status='approved' from public.tailor_applications where applicant_id='60000000-0000-4000-8000-000000000002'),'certificate-free approval');
select pg_temp.assert_true((select count(*)=0 from public.tailor_application_qualifications where applicant_id='60000000-0000-4000-8000-000000000002'),'no certificate required');
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
reset role;
-- Broader pre-existing Storage policies cannot reveal or delete evidence.
create policy test_evidence_broad_read on storage.objects for select to anon,authenticated using(true);
create policy test_evidence_broad_delete on storage.objects for delete to authenticated using(true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='tailor-application-certificates'),'broad read cannot leak other applicants');
with removed as (delete from storage.objects where bucket_id='tailor-application-certificates' returning name)
select pg_temp.assert_true((select count(*)=0 from removed),'broad delete cannot delete another applicant files');
reset role;
rollback;
select 'PASS: private qualifications, state locks, authorization, legacy compatibility' as result;
