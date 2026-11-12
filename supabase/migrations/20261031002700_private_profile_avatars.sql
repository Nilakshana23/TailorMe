begin;

-- Prerequisite: migrations 001-026. No changes to public shop images/evidence.
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_owner_path check (
 avatar_path is null or avatar_path ~ ('^' || id::text || '/avatar/[0-9a-f-]{36}\.(jpg|png|webp)$')
);
create index profiles_avatar_path_idx on public.profiles(avatar_path) where avatar_path is not null;
-- Existing SELECT is owner-only. No direct UPDATE grant on this new column.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.avatar_owned_path(path text) returns boolean
language sql stable set search_path='' as $$
 select auth.uid() is not null and coalesce(path ~ ('^' || auth.uid()::text || '/avatar/[0-9a-f-]{36}\.(jpg|png|webp)$'),false)
$$;
revoke all on function public.avatar_owned_path(text) from public,anon,authenticated;
-- Pure current-caller predicate (always false without auth.uid()). The anon
-- grant lets restrictive SELECT guards return no rows instead of a function
-- permission error when a project also has a broad legacy read policy.
grant execute on function public.avatar_owned_path(text) to anon,authenticated;

create function public.avatar_file_valid(path text,meta jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((case when meta->>'size' ~ '^[0-9]{1,10}$' then (meta->>'size')::numeric between 1 and 5242880 else false end)
  and case when path ~ '\.jpg$' then meta->>'mimetype'='image/jpeg'
   when path ~ '\.png$' then meta->>'mimetype'='image/png'
   when path ~ '\.webp$' then meta->>'mimetype'='image/webp' else false end,false)
$$;
revoke all on function public.avatar_file_valid(text,jsonb) from public,anon,authenticated;

create function public.avatar_upload_allowed(path text,meta jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select public.avatar_owned_path(path) and public.avatar_file_valid(path,case
  when meta ? 'size' then meta
  when meta ? 'contentLength' then meta || jsonb_build_object('size',meta->'contentLength')
  else meta end)
$$;
revoke all on function public.avatar_upload_allowed(text,jsonb) from public,anon,authenticated;
grant execute on function public.avatar_upload_allowed(text,jsonb) to authenticated;

create function public.set_profile_avatar(p_path text,p_expected_path text) returns text
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); previous text;
begin
 if caller is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select avatar_path into previous from public.profiles where id=caller for update;
 if not found then raise exception 'Profile unavailable.' using errcode='42501'; end if;
 if previous is distinct from p_expected_path then raise exception 'Photo changed. Reload before retrying.' using errcode='40001'; end if;
 if p_path is not null then
  if not public.avatar_owned_path(p_path) then raise exception 'Choose your own avatar.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path,27));
  perform 1 from storage.objects where bucket_id='profile-avatars' and name=p_path
   and public.avatar_file_valid(p_path,metadata) for share;
  if not found then raise exception 'Completed image upload not found.' using errcode='22023'; end if;
 end if;
 update public.profiles set avatar_path=p_path where id=caller;
 return p_path;
end;$$;
revoke all on function public.set_profile_avatar(text,text) from public,anon,authenticated;
grant execute on function public.set_profile_avatar(text,text) to authenticated;

-- Same advisory lock as attachment; an attached file is never deletable, even
-- after an ambiguous/lost save response. Bytes are removed only via Storage API.
create function public.avatar_file_deletable(path text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if not public.avatar_owned_path(path) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(path,27));
 return not exists(select 1 from public.profiles where avatar_path=path);
end;$$;
revoke all on function public.avatar_file_deletable(text) from public,anon,authenticated;
grant execute on function public.avatar_file_deletable(text) to authenticated;

create function public.unused_avatar_uploads() returns table(path text)
language sql stable security definer set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='profile-avatars'
 and public.avatar_owned_path(o.name) and o.created_at < now()-interval '1 hour'
 and not exists(select 1 from public.profiles p where p.avatar_path=o.name)
 order by o.created_at limit 100
$$;
revoke all on function public.unused_avatar_uploads() from public,anon,authenticated;
grant execute on function public.unused_avatar_uploads() to authenticated;

create policy avatar_read on storage.objects for select to authenticated
 using(bucket_id='profile-avatars' and public.avatar_owned_path(name));
create policy avatar_insert on storage.objects for insert to authenticated
 with check(bucket_id='profile-avatars' and public.avatar_upload_allowed(name,metadata));
create policy avatar_delete on storage.objects for delete to authenticated
 using(bucket_id='profile-avatars' and public.avatar_file_deletable(name));
-- Restrictive guards prevent older broad policies from opening this bucket.
create policy avatar_read_guard on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'profile-avatars' or (auth.uid() is not null and public.avatar_owned_path(name)));
create policy avatar_insert_guard on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'profile-avatars' or (auth.uid() is not null and public.avatar_upload_allowed(name,metadata)));
create policy avatar_delete_guard on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'profile-avatars' or (auth.uid() is not null and public.avatar_file_deletable(name)));
-- Immutable unique uploads, never overwrite, rename or upsert an existing file.
create policy avatar_update_guard on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'profile-avatars') with check(bucket_id<>'profile-avatars');
commit;
