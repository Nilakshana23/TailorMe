-- OWNER ONLY. This file is an example, never an application startup task.
-- In Supabase SQL Editor as postgres, replace the UUID with your CHOSEN EXISTING
-- account from Authentication > Users. Verify it carefully before running.
-- No service-role key is required. Never run this from a browser client.
begin;
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_YOUR_EXISTING_ACCOUNT_UUID'::uuid, 'admin')
on conflict (user_id) do update set role = 'admin';
select user_id, role from public.user_roles
where user_id = 'REPLACE_WITH_YOUR_EXISTING_ACCOUNT_UUID'::uuid;
commit;
-- Refresh portal access or sign out/in afterward. Do not execute for a stranger.
