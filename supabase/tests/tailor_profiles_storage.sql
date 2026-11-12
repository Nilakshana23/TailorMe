-- LOCAL FIXTURE SUITE, executed by npm test with PGlite Auth/Storage contracts.
-- Do NOT mutate storage.objects directly on a hosted project. Verify real blob
-- operations through the Storage API as described in TAILOR_DIRECTORY_SETUP.md.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', label; end if; end;
$$;
create function pg_temp.expect_error(statement text, expected_state text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then raise exception 'FAIL: expected %, got % for %', expected_state, actual_state, statement; end if;
    return;
  end;
  raise exception 'FAIL: expected denial (%) for %', expected_state, statement;
end;
$$;
create function pg_temp.shop_fields(p_name text) returns jsonb language sql as $$
  select jsonb_build_object('shop_name',p_name,'description','A bespoke atelier with thoughtful details.', 'specialties','Bridal, suits',
    'city','Colombo','public_address','123 Public Street','business_phone','+94112223344','years_experience',5,'accepting_requests',true);
$$;
insert into auth.users (id, raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','{"full_name":"First Tailor"}'),
 ('30000000-0000-4000-8000-000000000002','{"full_name":"Second Tailor"}'),
 ('30000000-0000-4000-8000-000000000003','{"full_name":"Customer","role":"tailor"}'),
 ('30000000-0000-4000-8000-000000000004','{"full_name":"Admin"}'),
 ('30000000-0000-4000-8000-000000000005','{"full_name":"Unapproved Tailor"}');
update public.user_roles set role='admin' where user_id='30000000-0000-4000-8000-000000000004';
update public.user_roles set role='tailor' where user_id='30000000-0000-4000-8000-000000000005';
select pg_temp.assert_true((select public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg','image/png','image/webp'] from storage.buckets where id='tailor-public'), 'public bucket size/MIME restrictions');

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select public.save_tailor_application('First Atelier','+94112223344','Colombo','123 Application Street','A professional tailoring studio.','Bridal, suits',5,true,null);
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select public.save_tailor_application('Second Atelier','+94112223344','Kandy','123 Application Street','A professional tailoring studio.','Suits',6,true,null);
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',true);
select public.review_tailor_application('30000000-0000-4000-8000-000000000001','approved',null,1);
select public.review_tailor_application('30000000-0000-4000-8000-000000000002','approved',null,1);
select pg_temp.expect_error('select public.initialize_tailor_profile()','42501');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000005',true);
select pg_temp.expect_error('select public.initialize_tailor_profile()','42501');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error('select public.initialize_tailor_profile()','42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000003/cover/30000000-0000-4000-8000-000000000010.jpg')$q$,'42501');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('Attack'),true,1)$q$,'42501');

select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((public.initialize_tailor_profile()).shop_name='First Atelier','approved application prefill');
select pg_temp.assert_true((public.initialize_tailor_profile()).public_address='123 Application Street','address copied to editable public field');
select pg_temp.assert_true((public.initialize_tailor_profile()).version=1,'initialization idempotent');
select pg_temp.assert_true((select count(*)=0 from public.tailor_profiles),'draft not exposed even in directory query by owner');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('First Atelier'),true,1)$q$,'23514');
select pg_temp.expect_error($q$update public.tailor_profiles set is_published=true$q$,'42501');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('First Atelier') || '{"owner_id":"30000000-0000-4000-8000-000000000002"}',false,1)$q$,'22023');
select pg_temp.expect_error($q$select public.set_tailor_cover('30000000-0000-4000-8000-000000000002/cover/30000000-0000-4000-8000-000000000010.jpg',1)$q$,'42501');
select pg_temp.expect_error($q$select public.set_tailor_cover('30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.jpg',1)$q$,'22023');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000002/cover/30000000-0000-4000-8000-000000000010.jpg')$q$,'42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.svg')$q$,'42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000001/../other.jpg')$q$,'42501');
insert into storage.objects(bucket_id,name,metadata) values
 ('tailor-public','30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.jpg','{"mimetype":"image/jpeg","size":1000}'),
 ('tailor-public','30000000-0000-4000-8000-000000000001/portfolio/30000000-0000-4000-8000-000000000011.png','{"mimetype":"image/png","size":1000}');
select public.set_tailor_cover('30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.jpg',1);
select public.add_tailor_portfolio('30000000-0000-4000-8000-000000000001/portfolio/30000000-0000-4000-8000-000000000011.png','Hand-finished suit');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('First Atelier'),true,1)$q$,'40001');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('First Atelier') || '{"description":""}',true,2)$q$,'23514');
select public.save_tailor_profile(pg_temp.shop_fields('Published Atelier'),true,2);
select pg_temp.assert_true((public.initialize_tailor_profile()).shop_name='Published Atelier','reinitialization preserves edits');
select pg_temp.assert_true((select shop_name='First Atelier' and status='approved' from public.tailor_applications where applicant_id=auth.uid()),'application review record unchanged');
select pg_temp.assert_true(not public.tailorme_shop_file_deletable('30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.jpg'),'referenced cover is not cleanup candidate');
with removed as (delete from storage.objects where bucket_id='tailor-public' returning name)
select pg_temp.assert_true((select count(*)=0 from removed),'referenced cover and portfolio cannot be deleted');
with changed as (update storage.objects set name=name where bucket_id='tailor-public' returning name)
select pg_temp.assert_true((select count(*)=0 from changed),'Storage overwrite denied');
select pg_temp.assert_true((select count(*)=0 from public.unused_tailor_uploads()),'attached images excluded from cleanup');
insert into storage.objects(bucket_id,name,created_at) values('tailor-public','30000000-0000-4000-8000-000000000001/portfolio/30000000-0000-4000-8000-000000000012.webp',now()-interval '2 hours');
select pg_temp.assert_true((select count(*)=1 from public.unused_tailor_uploads()),'old orphan is discoverable');

select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select public.initialize_tailor_profile();
-- Portfolio size is enforced at the RPC, including callers bypassing the UI.
insert into storage.objects(bucket_id,name)
  select 'tailor-public','30000000-0000-4000-8000-000000000002/portfolio/' ||
    '30000000-0000-4000-8000-' || lpad(n::text,12,'0') || '.jpg' from generate_series(100,120) n;
select public.add_tailor_portfolio(name,'Portfolio work') from storage.objects
  where bucket_id='tailor-public' and name like '30000000-0000-4000-8000-000000000002/portfolio/%'
    and name not like '%000000000120.jpg';
select pg_temp.expect_error($q$select public.add_tailor_portfolio('30000000-0000-4000-8000-000000000002/portfolio/30000000-0000-4000-8000-000000000120.jpg','One too many')$q$,'22023');
select pg_temp.expect_error($q$select public.caption_tailor_portfolio((select id from public.tailor_portfolio where owner_id='30000000-0000-4000-8000-000000000001' limit 1),'Attack')$q$,'42501');
select pg_temp.expect_error($q$select public.remove_tailor_portfolio((select id from public.tailor_portfolio where owner_id='30000000-0000-4000-8000-000000000001' limit 1))$q$,'42501');
with removed as (delete from storage.objects where bucket_id='tailor-public' and name like '30000000-0000-4000-8000-000000000001/%' returning name)
select pg_temp.assert_true((select count(*)=0 from removed),'other tailor cannot delete any first-tailor file');
select pg_temp.assert_true((select count(*)=0 from public.unused_tailor_uploads()),'cleanup scoped to caller');

-- Public clients receive only published shops/portfolio, never review or account data.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert_true((select count(*)=1 from public.tailor_profiles),'anonymous directory excludes unpublished');
select pg_temp.assert_true((select count(*)=1 from public.tailor_portfolio),'public portfolio visible');
select pg_temp.expect_error('select version from public.tailor_profiles','42501');
select pg_temp.expect_error('select * from public.tailor_applications','42501');
select pg_temp.expect_error('select * from public.profiles','42501');
select pg_temp.expect_error('select public.initialize_tailor_profile()','42501');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='tailor-public'),'public URLs do not imply public object listing');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.tailor_profiles),'customer directory');
select pg_temp.assert_true((select count(*)=0 from public.tailor_applications),'application details remain private');

-- Unpublish hides both shop and portfolio; referenced files remain protected.
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select public.save_tailor_profile(pg_temp.shop_fields('Published Atelier'),false,3);
select pg_temp.assert_true((select count(*)=0 from public.tailor_profiles),'unpublish hides directory row');
select public.save_tailor_profile(pg_temp.shop_fields('Published Atelier'),true,4);
select public.set_tailor_cover(null,5);
select pg_temp.assert_true(not (public.initialize_tailor_profile()).is_published,'cover removal unpublishes');
with removed as (delete from storage.objects where name='30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000010.jpg' returning name)
select pg_temp.assert_true((select count(*)=1 from removed),'detached cover removable');
select public.remove_tailor_portfolio((select id from public.tailor_portfolio where owner_id=auth.uid() limit 1));
with removed as (delete from storage.objects where bucket_id='tailor-public' returning name)
select pg_temp.assert_true((select count(*)=2 from removed),'only own detached portfolio and orphan removed');

-- Revoking trusted role immediately hides listings and blocks writes, regardless of metadata.
insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000013.jpg');
select public.set_tailor_cover('30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000013.jpg',6);
select public.save_tailor_profile(pg_temp.shop_fields('Published Atelier'),true,7);
reset role;
update public.user_roles set role='customer' where user_id='30000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.tailor_profiles),'revoked tailor not publicly listed');
select pg_temp.expect_error($q$select public.save_tailor_profile(pg_temp.shop_fields('Attack'),true,8)$q$,'42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000014.jpg')$q$,'42501');
reset role;

-- Existing permissive policies cannot bypass the new bucket's restrictive guards.
create policy test_broad_insert on storage.objects for insert to authenticated with check (true);
create policy test_broad_delete on storage.objects for delete to authenticated using (true);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('tailor-public','30000000-0000-4000-8000-000000000001/cover/30000000-0000-4000-8000-000000000015.jpg')$q$,'42501');
with removed as (delete from storage.objects where bucket_id='tailor-public' returning name)
select pg_temp.assert_true((select count(*)=1 and bool_and(name like '30000000-0000-4000-8000-000000000002/%') from removed),'broad policy still permits only own unreferenced orphan deletion');
reset role;
rollback;
select 'PASS: shop database and Storage policy contracts; local fixtures rolled back' as result;
