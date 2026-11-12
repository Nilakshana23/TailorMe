begin;

-- Prerequisites: migrations 001, 002, 003 and 004 in order. No legacy backfill.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tailor-application-certificates','tailor-application-certificates',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create table public.tailor_application_qualifications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.tailor_applications(applicant_id) on delete cascade,
  course_name text not null check (char_length(regexp_replace(course_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) between 1 and 200),
  institute text not null check (char_length(regexp_replace(institute, '^[[:space:]]+|[[:space:]]+$', '', 'g')) between 1 and 200),
  qualification_level text not null default '' check (char_length(qualification_level) <= 100),
  file_path text not null unique,
  created_at timestamptz not null default now(),
  check (file_path ~ ('^' || applicant_id::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'))
);
create index tailor_application_qualifications_applicant_idx on public.tailor_application_qualifications(applicant_id,id);
alter table public.tailor_application_qualifications enable row level security;
revoke all on public.tailor_application_qualifications from public, anon, authenticated;
grant select(id,applicant_id,course_name,institute,qualification_level,file_path) on public.tailor_application_qualifications to authenticated;
create policy application_qualification_read on public.tailor_application_qualifications for select to authenticated using (
  applicant_id = (select auth.uid()) or exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'
  )
);

-- Internal caller/locking check. Qualification changes serialize with submissions and
-- reviews on the SAME application row. No role or approval fields are accepted.
create function public.tailorme_editable_certificate_application(p_version integer)
returns uuid language plpgsql set search_path = '' as $$
declare caller uuid := auth.uid(); trusted_role text; application public.tailor_applications;
begin
  if caller is null then raise exception 'Sign in to edit your qualifications.' using errcode = '42501'; end if;
  select role into trusted_role from public.user_roles where user_id = caller for share;
  if trusted_role is distinct from 'customer' then raise exception 'Only applicants can edit qualifications.' using errcode = '42501'; end if;
  select * into application from public.tailor_applications where applicant_id = caller for update;
  if not found then raise exception 'Save a draft before adding qualifications.' using errcode = '22023'; end if;
  if application.status not in ('draft','rejected') then raise exception 'Pending and approved qualifications are locked.' using errcode = '22023'; end if;
  if application.version is distinct from p_version then raise exception 'Application changed. Reload before editing qualifications.' using errcode = '40001'; end if;
  return caller;
end;
$$;
revoke all on function public.tailorme_editable_certificate_application(integer) from public, anon, authenticated;

create function public.tailorme_require_certificate_file(p_path text, p_applicant uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_path is null or p_path !~ ('^' || p_applicant::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then
    raise exception 'Choose one of your own private certificate files.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path, 1));
  perform 1 from storage.objects where bucket_id = 'tailor-application-certificates' and name = p_path
    and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp','application/pdf')
    and case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric between 1 and 5242880 else false end
    for share;
  if not found then raise exception 'Certificate is missing or invalid. Upload a JPEG, PNG, WebP or PDF up to 5 MB.' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.tailorme_require_certificate_file(text,uuid) from public, anon, authenticated;

create function public.add_application_qualification(p_path text, p_expected_version integer, p_course_name text, p_institute text, p_level text default '')
returns public.tailor_application_qualifications language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_application_qualifications;
begin
  caller := public.tailorme_editable_certificate_application(p_expected_version);
  if (select count(*) from public.tailor_application_qualifications where applicant_id = caller) >= 3 then
    raise exception 'An application can have at most 3 qualifications.' using errcode = '22023'; end if;
  perform public.tailorme_require_certificate_file(p_path,caller);
  insert into public.tailor_application_qualifications(applicant_id,file_path,course_name,institute,qualification_level) values(caller,p_path,btrim(p_course_name),btrim(p_institute),btrim(coalesce(p_level,''))) returning * into result;
  return result;
end;
$$;
revoke all on function public.add_application_qualification(text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.add_application_qualification(text,integer,text,text,text) to authenticated;
create function public.remove_application_qualification(p_id uuid, p_expected_version integer)
returns text language plpgsql security definer set search_path = '' as $$
declare caller uuid; path text;
begin
  caller := public.tailorme_editable_certificate_application(p_expected_version);
  delete from public.tailor_application_qualifications where id = p_id and applicant_id = caller returning file_path into path;
  if not found then raise exception 'Certificate not found.' using errcode = '42501'; end if;
  return path;
end;
$$;
revoke all on function public.remove_application_qualification(uuid,integer) from public, anon, authenticated;
grant execute on function public.remove_application_qualification(uuid,integer) to authenticated;

create function public.tailorme_certificate_upload_allowed(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_path ~ ('^' || auth.uid()::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$')
    and exists (select 1 from public.tailor_applications a join public.user_roles r on r.user_id = a.applicant_id
      where a.applicant_id = auth.uid() and a.status in ('draft','rejected') and r.role = 'customer')
    and (select count(*) from public.tailor_application_qualifications where applicant_id = auth.uid()) < 3;
$$;
revoke all on function public.tailorme_certificate_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.tailorme_certificate_upload_allowed(text) to authenticated;
create function public.tailorme_certificate_read_allowed(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_path ~ ('^' || auth.uid()::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$')
    or (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
      and exists (select 1 from public.tailor_application_qualifications where file_path = p_path))
  );
$$;
revoke all on function public.tailorme_certificate_read_allowed(text) from public, anon, authenticated;
grant execute on function public.tailorme_certificate_read_allowed(text) to authenticated;
create function public.tailorme_certificate_file_deletable(p_path text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_path is null or p_path !~ ('^' || auth.uid()::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path,1));
  return not exists (select 1 from public.tailor_application_qualifications where file_path = p_path);
end;
$$;
revoke all on function public.tailorme_certificate_file_deletable(text) from public, anon, authenticated;
grant execute on function public.tailorme_certificate_file_deletable(text) to authenticated;
create function public.unused_application_qualification_uploads() returns table(path text)
language sql security definer set search_path = '' as $$
  select o.name from storage.objects o where auth.uid() is not null and o.bucket_id = 'tailor-application-certificates'
    and o.name ~ ('^' || auth.uid()::text || '/certificates/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$')
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.tailor_application_qualifications e where e.file_path = o.name)
    order by o.created_at limit 100;
$$;
revoke all on function public.unused_application_qualification_uploads() from public, anon, authenticated;
grant execute on function public.unused_application_qualification_uploads() to authenticated;

create policy certificate_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'tailor-application-certificates' and public.tailorme_certificate_upload_allowed(name));
create policy certificate_files_read on storage.objects for select to authenticated using (
  bucket_id = 'tailor-application-certificates' and public.tailorme_certificate_read_allowed(name));
create policy certificate_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'tailor-application-certificates' and public.tailorme_certificate_file_deletable(name));
-- Restrictive bucket guards prevent any older broad permissive policies from
-- granting other users access. CASE leaves unrelated buckets' policies unchanged.
create policy certificate_files_insert_guard on storage.objects as restrictive for insert to anon, authenticated with check (
  case when bucket_id <> 'tailor-application-certificates' then true when (select auth.uid()) is null then false
    else public.tailorme_certificate_upload_allowed(name) end);
create policy certificate_files_read_guard on storage.objects as restrictive for select to anon, authenticated using (
  case when bucket_id <> 'tailor-application-certificates' then true when (select auth.uid()) is null then false
    else public.tailorme_certificate_read_allowed(name) end);
create policy certificate_files_delete_guard on storage.objects as restrictive for delete to anon, authenticated using (
  case when bucket_id <> 'tailor-application-certificates' then true when (select auth.uid()) is null then false
    else public.tailorme_certificate_file_deletable(name) end);
create policy certificate_files_no_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'tailor-application-certificates') with check (bucket_id <> 'tailor-application-certificates');

create function public.tailorme_submission_qualifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare certificate record;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' then if old.status = 'pending' then return new; end if; end if;
  for certificate in select file_path from public.tailor_application_qualifications where applicant_id = new.applicant_id order by file_path loop
    perform public.tailorme_require_certificate_file(certificate.file_path,new.applicant_id);
  end loop;
  return new;
end;
$$;
revoke all on function public.tailorme_submission_qualifications() from public, anon, authenticated;
create trigger tailor_qualification_submission before insert or update of status on public.tailor_applications
  for each row execute function public.tailorme_submission_qualifications();
commit;
