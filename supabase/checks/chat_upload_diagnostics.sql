-- READ ONLY. Run manually in the intended project's SQL editor.
-- No live checks were run by Codex. Do not paste JWTs, keys or signed URLs.
begin read only;

select version,name from supabase_migrations.schema_migrations
where version in('20261029002000','20261029002100','20261030002200','20261030002300') order by version;

select id,name,public,file_size_limit,allowed_mime_types from storage.buckets
where id in('request-chat-images','request-reference-images','tailor-public');

-- Restrictive policies combine with AND. Inspect ALL live policies, including
-- manual/older policies absent from the repository. Non-chat guards should
-- evaluate true for request-chat-images; do not drop or disable RLS to debug.
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects' order by permissive,policyname;
select relrowsecurity,relforcerowsecurity from pg_class
where oid='storage.objects'::regclass;

select p.oid::regprocedure as function_name,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('valid_reference_file','valid_chat_upload_metadata','chat_image_write_allowed','reserve_chat_image','chat_image_ready')
order by p.proname;

-- Replace these placeholders with the failed image's reservation and current
-- authenticated user UUID. They are IDs, not access tokens. Use the actual
-- file.type and file.size shown by a local debugger, never image contents.
with target as (select
 '00000000-0000-0000-0000-000000000000'::uuid as upload_id,
 '00000000-0000-0000-0000-000000000000'::uuid as authenticated_user_id,
 'image/jpeg'::text as content_type,100::bigint as file_bytes)
select t.upload_id,t.authenticated_user_id,u.owner_id,u.request_id,u.draft_id,
 u.image_path,'request-chat-images' as expected_bucket,u.message_id,
 u.id is not null as slot_exists,u.owner_id=t.authenticated_user_id as owns_slot,
 t.authenticated_user_id in(r.customer_id,r.tailor_id) as request_participant,
 r.status,r.completed_at,(r.status in('pending','accepted') and r.completed_at is null) as writable,
 u.image_path ~ ('^'||u.owner_id::text||'/chat/'||u.request_id::text||'/'||u.draft_id::text||'/'||u.id::text||'\.(jpg|png|webp)$') as canonical_path,
 t.content_type,t.file_bytes,t.content_type in('image/jpeg','image/png','image/webp') as supported_mime,
 t.file_bytes between 1 and 5242880 as supported_size,
 case t.content_type when 'image/jpeg' then u.image_path ~ '\.jpg$' when 'image/png' then u.image_path ~ '\.png$' when 'image/webp' then u.image_path ~ '\.webp$' else false end as mime_matches_extension,
 o.id is not null as object_exists,o.metadata->>'size' as stored_size,
 o.metadata->>'contentLength' as probe_length,o.metadata->>'mimetype' as stored_mime
from target t left join public.chat_image_uploads u on u.id=t.upload_id
left join public.tailoring_requests r on r.id=u.request_id
left join storage.objects o on o.bucket_id='request-chat-images' and o.name=u.image_path;

commit;
