begin;
-- The same image metadata phases as chat (023): preflight contentLength,
-- completed size. Ownership/reservation/count/immutability remain unchanged;
-- readiness and request attachment still require final metadata.size.
create or replace function public.reference_upload_allowed(path text,meta jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(path,21));
 return public.valid_chat_upload_metadata(path,meta) and exists(
  select 1 from public.request_reference_uploads u join public.user_roles r on r.user_id=u.owner_id
  where u.owner_id=auth.uid() and r.role='customer' and u.image_path=path and u.submitted_request_id is null);
end;$$;
-- CREATE OR REPLACE preserves 021's restricted execution grants and policies.
commit;
