import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

test('PostgreSQL migrations and authorization/workflow suites (local Auth/Storage fixtures)', { timeout: 120000 }, async () => {
  const db = new PGlite()
  try {
    // Minimal Supabase Auth/Storage schema contracts, never a hosted project or
    // the actual Storage HTTP service. Bucket HTTP limits need live verification.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create schema storage;
      create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null,
        metadata jsonb default '{}', created_at timestamptz default now(), unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
    `)
    const migrations = new URL('../../supabase/migrations/', import.meta.url)
    const suites = {
      '20261026000100': 'portal_authorization.sql',
      '20261026000200': 'tailor_applications.sql',
      '20261026000300': 'tailor_profiles_storage.sql',
      '20261026000400': 'private_application_evidence.sql',
      '20261027000500': 'application_qualifications.sql',
      '20261027000600': 'tailoring_requests.sql',
      '20261027000700': 'confirmed_deadlines.sql',
      '20261027000800': 'deadline_schedule.sql',
      '20261027000900': 'request_quotations.sql',
      '20261027001000': 'tailoring_progress.sql',
      '20261027001100': 'customer_designs.sql',
      '20261028001200': 'custom_necklines.sql',
      '20261028001300': 'extended_garments.sql',
      '20261028001400': 'design_drawings.sql',
      '20261028001500': 'drawing_placement.sql',
      '20261028001600': 'blank_sketches.sql',
      '20261029001700': 'my_measurements.sql',
      '20261029001800': 'template_refinement.sql',
      '20261029001900': 'collar_styles.sql',
      '20261029002000': 'request_messages.sql',
      '20261029002100': 'request_references.sql',
      '20261030002200': 'chat_images.sql',
      '20261030002300': 'chat_upload_metadata.sql',
      '20261030002400': 'design_proposals.sql',
      '20261030002500': 'direct_payments.sql',
      '20261030002600': 'reference_upload_metadata.sql',
      '20261031002700': 'profile_avatars.sql',
      '20261031002800': 'tailors_as_requesters.sql',
      '20261113002900': 'dress_back_neckline.sql',
    }
    for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
      if (file.startsWith('20261026000400')) {
        // Genuine pre-migration pending/approved rows, without invented photos.
        await db.exec(readFileSync(new URL('../../supabase/tests/fixtures/legacy_applications.sql',import.meta.url),'utf8'))
      }
      if (file.startsWith('20261027001000')) {
        // Genuine pre-progress completion: no stage/event is fabricated.
        await db.exec(`insert into auth.users(id) values('80000000-0000-4000-8000-000000000001'),('80000000-0000-4000-8000-000000000002');
          insert into public.tailoring_requests(id,customer_id,tailor_id,customer_name,shop_name,garment_type,description,quantity,preferred_date,status,responded_at,completed_at)
          values('80000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','Legacy Customer','Legacy Shop','Dress','Previously completed work.',1,'2026-01-01','accepted',now(),now());`)
      }
      if (file.startsWith('20261027000800')) {
        // Contract fixture only: PGlite has no pg_cron daemon/extension.
        await db.exec(`create schema cron;
          create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text);
          create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language sql as $$
            insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
            on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
          $$;`)
      }
      if (file.startsWith('20261028001200')) {
        await db.exec(`insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length)
          values('84000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','Legacy dress','dress','ruby','round','short','midi');
          insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length)
          values('80000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000001',1,'Legacy dress','dress','ruby','round','short','midi');`)
      }
      if (file.startsWith('20261028001300')) {
        await db.exec(`insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline,attached_at)
          values('84000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','Existing custom dress','dress','ruby','v','long','midi',2,'{"depths":[65,80,104,90,65]}',now());
          insert into public.tailoring_requests(id,customer_id,tailor_id,customer_name,shop_name,garment_type,description,quantity,preferred_date,status)
          values('80000000-0000-4000-8000-000000000004','80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','Legacy Customer','Legacy Shop','dress','Existing custom design request.',1,current_date+30,'pending');
          insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length,format_version,custom_neckline)
          values('80000000-0000-4000-8000-000000000004','84000000-0000-4000-8000-000000000002',1,'Existing custom dress','dress','ruby','v','long','midi',2,'{"depths":[65,80,104,90,65]}');`)
      }
      if (file.startsWith('20261028001400')) {
        await db.exec(`insert into public.customer_designs(id,owner_id,name,garment_type,colour,neckline,sleeve,length,format_version,garment_options,attached_at)
          values('84000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000001','Existing shirt','shirt','navy','round','long','midi',3,'{"collar":"point"}',now());
          insert into public.tailoring_requests(id,customer_id,tailor_id,customer_name,shop_name,garment_type,description,quantity,preferred_date,status)
          values('80000000-0000-4000-8000-000000000005','80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','Legacy Customer','Legacy Shop','shirt','Existing shirt request.',1,current_date+30,'pending');
          insert into public.request_design_snapshots(request_id,design_id,design_version,name,garment_type,colour,neckline,sleeve,length,format_version,garment_options)
          values('80000000-0000-4000-8000-000000000005','84000000-0000-4000-8000-000000000003',1,'Existing shirt','shirt','navy','round','long','midi',3,'{"collar":"point"}');`)
      }
      if (file.startsWith('20261028001500')) {
        // A real legacy clipped drawing exists before the mode validator changes.
        await db.exec(`update public.customer_designs set decorations='{"version":1,"strokes":[{"colour":"#303039","width":3,"points":[[100,100],[9000,9000]]}]}' where id='84000000-0000-4000-8000-000000000001';
          update public.request_design_snapshots set decorations='{"version":1,"strokes":[{"colour":"#303039","width":3,"points":[[100,100],[9000,9000]]}]}' where design_id='84000000-0000-4000-8000-000000000001';`)
      }
      await db.exec(readFileSync(new URL(file, migrations), 'utf8'))
      // Historical suites verify their version's rules; the new suite verifies
      // changed rules AND preservation of pre-existing approved/pending data.
      const suite = suites[file.slice(0,14)]
      assert.ok(suite,`Migration has a workflow suite: ${file}`)
      const results = await db.exec(readFileSync(new URL(`../../supabase/tests/${suite}`, import.meta.url), 'utf8'))
      assert.match(results.at(-1).rows[0].result, /^PASS:/)
    }
    // Re-run design regressions against the final schema, including migration 029.
    for(const suite of ['collar_styles.sql','template_refinement.sql']){
      const results=await db.exec(readFileSync(new URL('../../supabase/tests/'+suite,import.meta.url),'utf8'))
      assert.match(results.at(-1).rows[0].result,/^PASS:/)
    }
    const sharing = await db.exec(readFileSync(new URL('../../supabase/tests/sketch_sharing.sql',import.meta.url),'utf8'))
    assert.match(sharing.at(-1).rows[0].result,/^PASS:/)
    // Exercise the actual browser cleanup output through unchanged SQL save/read/snapshot contracts.
    const code=ts.transpileModule(readFileSync(new URL('../src/utils/designDrawing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    const {cleanupDrawing}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    const original={version:2,strokes:[{mode:'canvas',colour:'#123abc',width:5,points:Array.from({length:80},(_,i)=>[1000+i*90,2000+i*35+(i%2?8:-8)])},{kind:'rectangle',mode:'canvas',colour:'#abcdef',fill:'#FEDCBA',width:4,points:[[100,100],[900,900]]}]}
    const cleaned=cleanupDrawing(original,{strength:'medium'})
    assert.ok(cleaned.strokes[0].points.length<original.strokes[0].points.length)
    await db.query("select set_config('test.cleanup_original',$1,false),set_config('test.cleanup_result',$2,false)",[JSON.stringify(original),JSON.stringify(cleaned)])
    const cleanup=await db.exec(readFileSync(new URL('../../supabase/tests/line_cleanup.sql',import.meta.url),'utf8'))
    assert.match(cleanup.at(-1).rows[0].result,/^PASS:/)
    await db.exec(`delete from public.request_design_snapshots where design_id::text like '84000000%';
      delete from public.customer_designs where id::text like '84000000%';
      delete from public.tailoring_requests where id in('80000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000004','80000000-0000-4000-8000-000000000005');
      delete from auth.users where id in('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');
      delete from auth.users where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
      delete from auth.users where id='50000000-0000-4000-8000-000000000003';`)
    const { rows } = await db.query('select count(*)::integer as users from auth.users')
    assert.equal(rows[0].users, 0, 'SQL test fixtures were rolled back')
  } finally { await db.close() }
})
