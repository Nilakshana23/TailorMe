-- OWNER ONLY: run manually in Supabase SQL Editor as postgres.
-- Copy an EXISTING test user's UUID from Authentication > Users.
-- Replace the UUID and choose exactly 'tailor' or 'admin'. Never run from a browser.
begin;
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid, 'tailor')
on conflict (user_id) do update set role = excluded.role;
-- Inspect the result before committing. Use 'customer' to remove elevated access.
select user_id, role from public.user_roles
where user_id = 'REPLACE_WITH_EXISTING_TEST_USER_UUID'::uuid;
commit;
