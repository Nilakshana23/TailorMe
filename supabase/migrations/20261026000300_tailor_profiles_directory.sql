begin;

-- This bucket is PUBLIC, including files uploaded before shop publication.
-- Never put customer references, body photos, or private documents here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tailor-public', 'tailor-public', true, 5242880, array['image/jpeg','image/png','image/webp']);

create table public.tailor_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default '' check (char_length(shop_name) <= 160),
  description text not null default '' check (char_length(description) <= 4000),
  specialties text not null default '' check (char_length(specialties) <= 500),
  city text not null default '' check (char_length(city) <= 120),
  public_address text not null default '' check (char_length(public_address) <= 500),
  business_phone text not null default '' check (char_length(business_phone) <= 32),
  years_experience integer check (years_experience between 0 and 80),
  accepting_requests boolean not null default true,
  is_published boolean not null default false,
  cover_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cover_path is null or cover_path ~ ('^' || owner_id::text || '/cover/[0-9a-f-]{36}\.(jpg|png|webp)$')),
  constraint published_shop_complete check (not is_published or (
    char_length(regexp_replace(shop_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
    and char_length(regexp_replace(description, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 20
    and char_length(regexp_replace(specialties, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
    and char_length(regexp_replace(city, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 2
    and char_length(regexp_replace(public_address, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 5
    and business_phone ~ '^[+0-9() .-]{7,32}$'
    and char_length(regexp_replace(business_phone, '[^0-9]', '', 'g')) between 7 and 15
    and years_experience is not null and cover_path is not null
  ))
);
create index tailor_profiles_directory_idx on public.tailor_profiles (shop_name, owner_id) where is_published;
create index tailor_profiles_cover_idx on public.tailor_profiles (cover_path) where cover_path is not null;
create table public.tailor_portfolio (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.tailor_profiles(owner_id) on delete cascade,
  image_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 300),
  created_at timestamptz not null default now(),
  check (image_path ~ ('^' || owner_id::text || '/portfolio/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index tailor_portfolio_owner_idx on public.tailor_portfolio (owner_id, created_at, id);
alter table public.tailor_profiles enable row level security;
alter table public.tailor_portfolio enable row level security;
revoke all on public.tailor_profiles, public.tailor_portfolio from public, anon, authenticated;
-- Explicit public projections: no Auth emails, application data, server version,
-- review details, or private account fields can be selected, even via direct API.
grant select (owner_id,shop_name,description,specialties,city,public_address,business_phone,
  years_experience,accepting_requests,is_published,cover_path) on public.tailor_profiles to anon, authenticated;
grant select (id,owner_id,image_path,caption) on public.tailor_portfolio to anon, authenticated;

create function public.tailorme_can_manage_shop() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r join public.tailor_applications a on a.applicant_id = r.user_id
    where r.user_id = auth.uid() and r.role = 'tailor' and a.status = 'approved');
$$;
revoke all on function public.tailorme_can_manage_shop() from public, anon, authenticated;
grant execute on function public.tailorme_can_manage_shop() to authenticated;

-- Returns only public visibility, not a private role or application status.
-- Owner execution bypasses RLS on the referenced tables, preventing recursion.
create function public.tailorme_shop_is_public(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tailor_profiles p
    join public.user_roles r on r.user_id = p.owner_id
    join public.tailor_applications a on a.applicant_id = p.owner_id
    where p.owner_id = p_owner and p.is_published and r.role = 'tailor' and a.status = 'approved');
$$;
revoke all on function public.tailorme_shop_is_public(uuid) from public, anon, authenticated;
grant execute on function public.tailorme_shop_is_public(uuid) to anon, authenticated;
create policy shops_read on public.tailor_profiles for select to anon, authenticated
  using (public.tailorme_shop_is_public(owner_id));
create policy portfolio_read on public.tailor_portfolio for select to anon, authenticated
  using (owner_id = (select auth.uid()) or public.tailorme_shop_is_public(owner_id));

-- Internal locking check, called only by owner-executed mutation RPCs.
create function public.tailorme_require_shop_owner() returns uuid
language plpgsql set search_path = '' as $$
declare caller uuid := auth.uid(); trusted_role text;
begin
  if caller is null then raise exception 'Sign in as an approved tailor.' using errcode = '42501'; end if;
  select role into trusted_role from public.user_roles where user_id = caller for share;
  if trusted_role is distinct from 'tailor' then raise exception 'Approved tailor access required.' using errcode = '42501'; end if;
  perform 1 from public.tailor_applications where applicant_id = caller and status = 'approved' for share;
  if not found then raise exception 'An approved application is required.' using errcode = '42501'; end if;
  return caller;
end;
$$;
revoke all on function public.tailorme_require_shop_owner() from public, anon, authenticated;

create function public.initialize_tailor_profile() returns public.tailor_profiles
language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_profiles;
begin
  caller := public.tailorme_require_shop_owner();
  insert into public.tailor_profiles (owner_id,shop_name,description,specialties,city,public_address,business_phone,years_experience)
    select applicant_id,shop_name,description,specialties,city,address,phone,years_experience
    from public.tailor_applications where applicant_id = caller and status = 'approved'
    on conflict (owner_id) do nothing;
  select * into result from public.tailor_profiles where owner_id = caller;
  return result;
end;
$$;
revoke all on function public.initialize_tailor_profile() from public, anon, authenticated;
grant execute on function public.initialize_tailor_profile() to authenticated;

create function public.save_tailor_profile(p_fields jsonb, p_publish boolean, p_expected_version integer)
returns public.tailor_profiles language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_profiles;
begin
  caller := public.tailorme_require_shop_owner();
  if p_publish is null then raise exception 'Choose published or unpublished.' using errcode = '22023'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) k where k not in
    ('shop_name','description','specialties','city','public_address','business_phone','years_experience','accepting_requests')
  ) then raise exception 'Only public business fields may be edited.' using errcode = '22023'; end if;
  select * into result from public.tailor_profiles where owner_id = caller for update;
  if not found then raise exception 'Initialize your shop profile first.' using errcode = '22023'; end if;
  if result.version is distinct from p_expected_version then raise exception 'Profile changed. Reload before saving.' using errcode = '40001'; end if;
  update public.tailor_profiles set shop_name = btrim(p_fields->>'shop_name'), description = btrim(p_fields->>'description'),
    specialties = btrim(p_fields->>'specialties'), city = btrim(p_fields->>'city'), public_address = btrim(p_fields->>'public_address'),
    business_phone = btrim(p_fields->>'business_phone'), years_experience = (p_fields->>'years_experience')::integer,
    accepting_requests = (p_fields->>'accepting_requests')::boolean, is_published = p_publish,
    version = version + 1, updated_at = clock_timestamp() where owner_id = caller returning * into result;
  return result;
end;
$$;
revoke all on function public.save_tailor_profile(jsonb,boolean,integer) from public, anon, authenticated;
grant execute on function public.save_tailor_profile(jsonb,boolean,integer) to authenticated;

-- Files must already exist, belong to the caller, and be in the correct folder.
-- File attachment and Storage DELETE checks serialize on the same advisory key.
create function public.tailorme_require_shop_image(p_path text, p_kind text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_path is null or p_path !~ ('^' || auth.uid()::text || '/' || p_kind || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Choose one of your own shop images.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path, 0));
  perform 1 from storage.objects where bucket_id = 'tailor-public' and name = p_path for share;
  if not found then raise exception 'Image upload is missing. Upload it again.' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.tailorme_require_shop_image(text,text) from public, anon, authenticated;

create function public.set_tailor_cover(p_path text, p_expected_version integer) returns public.tailor_profiles
language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_profiles;
begin
  caller := public.tailorme_require_shop_owner();
  select * into result from public.tailor_profiles where owner_id = caller for update;
  if not found then raise exception 'Initialize your shop first.' using errcode = '22023'; end if;
  if result.version is distinct from p_expected_version then raise exception 'Profile changed. Reload before replacing the cover.' using errcode = '40001'; end if;
  if p_path is not null then perform public.tailorme_require_shop_image(p_path, 'cover'); end if;
  -- Removing a required cover also unpublishes, never leaves an incomplete listing.
  update public.tailor_profiles set cover_path = p_path, is_published = is_published and p_path is not null,
    version = version + 1, updated_at = clock_timestamp() where owner_id = caller returning * into result;
  return result;
end;
$$;
revoke all on function public.set_tailor_cover(text,integer) from public, anon, authenticated;
grant execute on function public.set_tailor_cover(text,integer) to authenticated;

create function public.add_tailor_portfolio(p_path text, p_caption text) returns public.tailor_portfolio
language plpgsql security definer set search_path = '' as $$
declare caller uuid; result public.tailor_portfolio;
begin
  caller := public.tailorme_require_shop_owner();
  perform 1 from public.tailor_profiles where owner_id = caller for update;
  if not found then raise exception 'Initialize your shop first.' using errcode = '22023'; end if;
  if (select count(*) from public.tailor_portfolio where owner_id = caller) >= 20 then
    raise exception 'A portfolio can have at most 20 images.' using errcode = '22023'; end if;
  perform public.tailorme_require_shop_image(p_path, 'portfolio');
  insert into public.tailor_portfolio(owner_id,image_path,caption) values (caller,p_path,btrim(p_caption)) returning * into result;
  return result;
end;
$$;
revoke all on function public.add_tailor_portfolio(text,text) from public, anon, authenticated;
grant execute on function public.add_tailor_portfolio(text,text) to authenticated;

create function public.caption_tailor_portfolio(p_id uuid, p_caption text) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid;
begin
  caller := public.tailorme_require_shop_owner();
  update public.tailor_portfolio set caption = btrim(p_caption) where id = p_id and owner_id = caller;
  if not found then raise exception 'Portfolio image not found.' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.caption_tailor_portfolio(uuid,text) from public, anon, authenticated;
grant execute on function public.caption_tailor_portfolio(uuid,text) to authenticated;
create function public.remove_tailor_portfolio(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare caller uuid; old_path text;
begin
  caller := public.tailorme_require_shop_owner();
  delete from public.tailor_portfolio where id = p_id and owner_id = caller returning image_path into old_path;
  if not found then raise exception 'Portfolio image not found.' using errcode = '42501'; end if;
  return old_path;
end;
$$;
revoke all on function public.remove_tailor_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.remove_tailor_portfolio(uuid) to authenticated;

-- Only unreferenced files owned by the caller may be removed. Keep public paths
-- intact on failed/uncertain DB writes; no deletion of another user's uploads.
create function public.tailorme_shop_file_deletable(p_path text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_path is null or p_path !~ ('^' || auth.uid()::text || '/(cover|portfolio)/[0-9a-f-]{36}\.(jpg|png|webp)$') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path, 0));
  return not exists (select 1 from public.tailor_profiles where cover_path = p_path)
    and not exists (select 1 from public.tailor_portfolio where image_path = p_path);
end;
$$;
revoke all on function public.tailorme_shop_file_deletable(text) from public, anon, authenticated;
grant execute on function public.tailorme_shop_file_deletable(text) to authenticated;
create function public.unused_tailor_uploads() returns table (path text)
language plpgsql security definer set search_path = '' as $$
declare caller uuid;
begin
  caller := public.tailorme_require_shop_owner();
  return query select o.name from storage.objects o where o.bucket_id = 'tailor-public'
    and o.name ~ ('^' || caller::text || '/(cover|portfolio)/[0-9a-f-]{36}\.(jpg|png|webp)$')
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.tailor_profiles p where p.cover_path = o.name)
    and not exists (select 1 from public.tailor_portfolio p where p.image_path = o.name)
    order by o.created_at limit 100;
end;
$$;
revoke all on function public.unused_tailor_uploads() from public, anon, authenticated;
grant execute on function public.unused_tailor_uploads() to authenticated;

-- Do not alter Supabase's managed Storage tables; only add bucket-scoped policies.
create policy tailor_images_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'tailor-public' and public.tailorme_can_manage_shop()
  and name ~ ('^' || (select auth.uid())::text || '/(cover|portfolio)/[0-9a-f-]{36}\.(jpg|png|webp)$')
);
create policy tailor_images_select_own on storage.objects for select to authenticated using (
  bucket_id = 'tailor-public' and split_part(name,'/',1) = (select auth.uid())::text
);
create policy tailor_images_delete on storage.objects for delete to authenticated using (
  bucket_id = 'tailor-public' and public.tailorme_can_manage_shop() and public.tailorme_shop_file_deletable(name)
);
-- No UPDATE policy: unique object names, never overwrite existing files.
-- Restrictive guards also protect this bucket if a project has an older broad
-- permissive policy. These guards leave every other bucket's policies intact.
create policy tailor_images_insert_guard on storage.objects as restrictive for insert to anon, authenticated with check (
  case when bucket_id <> 'tailor-public' then true when (select auth.uid()) is null then false
    else public.tailorme_can_manage_shop()
      and name ~ ('^' || (select auth.uid())::text || '/(cover|portfolio)/[0-9a-f-]{36}\.(jpg|png|webp)$') end
);
create policy tailor_images_delete_guard on storage.objects as restrictive for delete to anon, authenticated using (
  case when bucket_id <> 'tailor-public' then true when (select auth.uid()) is null then false
    else public.tailorme_can_manage_shop() and public.tailorme_shop_file_deletable(name) end
);
create policy tailor_images_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'tailor-public') with check (bucket_id <> 'tailor-public');
create policy tailor_images_select_guard on storage.objects as restrictive for select to anon, authenticated using (
  bucket_id <> 'tailor-public' or split_part(name,'/',1) = (select auth.uid())::text
);
commit;
