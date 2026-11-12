begin;

-- Public photos are optional. Keep all existing profile/business data intact.
alter table public.tailor_profiles drop constraint published_shop_complete;
alter table public.tailor_profiles add constraint published_shop_complete check (not is_published or (
  char_length(regexp_replace(shop_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
  and char_length(regexp_replace(description, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 20
  and char_length(regexp_replace(specialties, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
  and char_length(regexp_replace(city, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
  and char_length(regexp_replace(public_address, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 5
  and business_phone ~ '^[+0-9() .-]{7,32}$'
  and char_length(regexp_replace(business_phone, '[^0-9]', '', 'g')) between 7 and 15
  and years_experience is not null
));
create or replace function public.set_tailor_cover(p_path text, p_expected_version integer) returns public.tailor_profiles
language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_profiles;
begin
  caller := public.tailorme_require_shop_owner();
  select * into result from public.tailor_profiles where owner_id = caller for update;
  if not found then raise exception 'Initialize your shop first.' using errcode = '22023'; end if;
  if result.version is distinct from p_expected_version then raise exception 'Profile changed. Reload before replacing the cover.' using errcode = '40001'; end if;
  if p_path is not null then perform public.tailorme_require_shop_image(p_path, 'cover'); end if;
  update public.tailor_profiles set cover_path = p_path, version = version + 1, updated_at = clock_timestamp()
    where owner_id = caller returning * into result;
  return result;
end;
$$;
revoke all on function public.set_tailor_cover(text,integer) from public, anon, authenticated;
grant execute on function public.set_tailor_cover(text,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tailor-application-evidence','tailor-application-evidence',false,5242880,array['image/jpeg','image/png','image/webp']);
create table public.tailor_application_evidence (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.tailor_applications(applicant_id) on delete cascade,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  check (image_path ~ ('^' || applicant_id::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index tailor_application_evidence_applicant_idx on public.tailor_application_evidence(applicant_id,id);
alter table public.tailor_application_evidence enable row level security;
revoke all on public.tailor_application_evidence from public, anon, authenticated;
grant select(id,applicant_id,image_path) on public.tailor_application_evidence to authenticated;
create policy application_evidence_read on public.tailor_application_evidence for select to authenticated using (
  applicant_id = (select auth.uid()) or exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin'
  )
);

-- Internal caller/locking check. Evidence changes serialize with submissions and
-- reviews on the SAME application row. No role or approval fields are accepted.
create function public.tailorme_editable_evidence_application(p_version integer)
returns uuid language plpgsql set search_path = '' as $$
declare caller uuid := auth.uid(); trusted_role text; application public.tailor_applications;
begin
  if caller is null then raise exception 'Sign in to edit your work photos.' using errcode = '42501'; end if;
  select role into trusted_role from public.user_roles where user_id = caller for share;
  if trusted_role is distinct from 'customer' then raise exception 'Only applicants can edit work photos.' using errcode = '42501'; end if;
  select * into application from public.tailor_applications where applicant_id = caller for update;
  if not found then raise exception 'Save a draft before adding work photos.' using errcode = '22023'; end if;
  if application.status not in ('draft','rejected') then raise exception 'Pending and approved work photos are locked.' using errcode = '22023'; end if;
  if application.version is distinct from p_version then raise exception 'Application changed. Reload before editing work photos.' using errcode = '40001'; end if;
  return caller;
end;
$$;
revoke all on function public.tailorme_editable_evidence_application(integer) from public, anon, authenticated;

create function public.tailorme_require_evidence_file(p_path text, p_applicant uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if p_path is null or p_path !~ ('^' || p_applicant::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Choose one of your own private work photos.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path, 1));
  perform 1 from storage.objects where bucket_id = 'tailor-application-evidence' and name = p_path
    and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
    and case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric between 1 and 5242880 else false end
    for share;
  if not found then raise exception 'Work photo is missing or invalid. Upload a JPEG, PNG, or WebP up to 5 MB.' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.tailorme_require_evidence_file(text,uuid) from public, anon, authenticated;

create function public.add_application_evidence(p_path text, p_expected_version integer)
returns public.tailor_application_evidence language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_application_evidence;
begin
  caller := public.tailorme_editable_evidence_application(p_expected_version);
  if (select count(*) from public.tailor_application_evidence where applicant_id = caller) >= 3 then
    raise exception 'An application can have at most 3 work photos.' using errcode = '22023'; end if;
  perform public.tailorme_require_evidence_file(p_path,caller);
  insert into public.tailor_application_evidence(applicant_id,image_path) values(caller,p_path) returning * into result;
  return result;
end;
$$;
revoke all on function public.add_application_evidence(text,integer) from public, anon, authenticated;
grant execute on function public.add_application_evidence(text,integer) to authenticated;
create function public.remove_application_evidence(p_id uuid, p_expected_version integer)
returns text language plpgsql security definer set search_path = '' as $$
declare caller uuid; path text;
begin
  caller := public.tailorme_editable_evidence_application(p_expected_version);
  delete from public.tailor_application_evidence where id = p_id and applicant_id = caller returning image_path into path;
  if not found then raise exception 'Work photo not found.' using errcode = '42501'; end if;
  return path;
end;
$$;
revoke all on function public.remove_application_evidence(uuid,integer) from public, anon, authenticated;
grant execute on function public.remove_application_evidence(uuid,integer) to authenticated;

-- Not a retroactive CHECK: legacy pending/approved rows remain valid, and their
-- reviews still use the original atomic approve/customer->tailor RPC unchanged.
-- Only entering pending (including rejected resubmissions) needs 1–3 valid files.
create function public.tailorme_submission_work_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare photo_count integer; photo record;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' then if old.status = 'pending' then return new; end if; end if;
  select count(*) into photo_count from public.tailor_application_evidence where applicant_id = new.applicant_id;
  if photo_count not between 1 and 3 then raise exception 'Add 1–3 private photos of work you have made before submitting.' using errcode = '23514'; end if;
  for photo in select image_path from public.tailor_application_evidence where applicant_id = new.applicant_id order by image_path loop
    perform public.tailorme_require_evidence_file(photo.image_path,new.applicant_id);
  end loop;
  return new;
end;
$$;
revoke all on function public.tailorme_submission_work_photos() from public, anon, authenticated;
create trigger tailor_evidence_submission before insert or update of status on public.tailor_applications
  for each row execute function public.tailorme_submission_work_photos();

create function public.tailorme_evidence_upload_allowed(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_path ~ ('^' || auth.uid()::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$')
    and exists (select 1 from public.tailor_applications a join public.user_roles r on r.user_id = a.applicant_id
      where a.applicant_id = auth.uid() and a.status in ('draft','rejected') and r.role = 'customer')
    and (select count(*) from public.tailor_application_evidence where applicant_id = auth.uid()) < 3;
$$;
revoke all on function public.tailorme_evidence_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.tailorme_evidence_upload_allowed(text) to authenticated;
create function public.tailorme_evidence_read_allowed(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_path ~ ('^' || auth.uid()::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$')
    or (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
      and exists (select 1 from public.tailor_application_evidence where image_path = p_path))
  );
$$;
revoke all on function public.tailorme_evidence_read_allowed(text) from public, anon, authenticated;
grant execute on function public.tailorme_evidence_read_allowed(text) to authenticated;
create function public.tailorme_evidence_file_deletable(p_path text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_path is null or p_path !~ ('^' || auth.uid()::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path,1));
  return not exists (select 1 from public.tailor_application_evidence where image_path = p_path);
end;
$$;
revoke all on function public.tailorme_evidence_file_deletable(text) from public, anon, authenticated;
grant execute on function public.tailorme_evidence_file_deletable(text) to authenticated;
create function public.unused_application_evidence_uploads() returns table(path text)
language sql security definer set search_path = '' as $$
  select o.name from storage.objects o where auth.uid() is not null and o.bucket_id = 'tailor-application-evidence'
    and o.name ~ ('^' || auth.uid()::text || '/work/[0-9a-f-]{36}\.(jpg|png|webp)$')
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.tailor_application_evidence e where e.image_path = o.name)
    order by o.created_at limit 100;
$$;
revoke all on function public.unused_application_evidence_uploads() from public, anon, authenticated;
grant execute on function public.unused_application_evidence_uploads() to authenticated;

create policy evidence_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'tailor-application-evidence' and public.tailorme_evidence_upload_allowed(name));
create policy evidence_files_read on storage.objects for select to authenticated using (
  bucket_id = 'tailor-application-evidence' and public.tailorme_evidence_read_allowed(name));
create policy evidence_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'tailor-application-evidence' and public.tailorme_evidence_file_deletable(name));
-- Restrictive bucket guards prevent any older broad permissive policies from
-- granting other users access. CASE leaves unrelated buckets' policies unchanged.
create policy evidence_files_insert_guard on storage.objects as restrictive for insert to anon, authenticated with check (
  case when bucket_id <> 'tailor-application-evidence' then true when (select auth.uid()) is null then false
    else public.tailorme_evidence_upload_allowed(name) end);
create policy evidence_files_read_guard on storage.objects as restrictive for select to anon, authenticated using (
  case when bucket_id <> 'tailor-application-evidence' then true when (select auth.uid()) is null then false
    else public.tailorme_evidence_read_allowed(name) end);
create policy evidence_files_delete_guard on storage.objects as restrictive for delete to anon, authenticated using (
  case when bucket_id <> 'tailor-application-evidence' then true when (select auth.uid()) is null then false
    else public.tailorme_evidence_file_deletable(name) end);
create policy evidence_files_no_update on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'tailor-application-evidence') with check (bucket_id <> 'tailor-application-evidence');

commit;
