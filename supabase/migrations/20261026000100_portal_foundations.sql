begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one trusted portal role per user. Metadata is never an authority.
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'tailor', 'admin'))
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on public.profiles, public.user_roles from public, anon, authenticated;
grant select on public.profiles, public.user_roles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_read_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy roles_read_own on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));
-- Intentionally no INSERT/UPDATE/DELETE policies or grants for user_roles.
-- Even portal admins are ordinary authenticated API users, not DB owners.

create function public.tailorme_touch_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.tailorme_touch_profile() from public, anon, authenticated;
create trigger tailorme_profile_updated before update on public.profiles
  for each row execute function public.tailorme_touch_profile();

create function public.tailorme_handle_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200))
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer')
    on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.tailorme_handle_signup() from public, anon, authenticated;
create trigger tailorme_auth_user_created after insert on auth.users
  for each row execute function public.tailorme_handle_signup();

-- Safe backfill: never replace an existing profile or privileged assignment.
insert into public.profiles (id, full_name)
  select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 200) from auth.users
  on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
  select id, 'customer' from auth.users on conflict (user_id) do nothing;

commit;
