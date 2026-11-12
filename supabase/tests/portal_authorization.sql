-- Run the entire script as postgres in SQL Editor AFTER the migration.
-- Fixtures and all changes are rolled back. Any assertion failure aborts the test.
begin;
insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{"full_name":"Customer Test","role":"admin"}'),
  ('10000000-0000-4000-8000-000000000002', '{"full_name":"Other Test","role":"tailor"}');

do $$ begin
  if (select count(*) from public.user_roles where user_id in
    ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') and role = 'customer') <> 2
    then raise exception 'FAIL: metadata escalated signup role'; end if;
  if (select full_name from public.profiles where id = '10000000-0000-4000-8000-000000000001') <> 'Customer Test'
    then raise exception 'FAIL: signup profile missing'; end if;
end $$;

-- Exercise backfill conflict behavior with an existing privileged assignment.
update public.user_roles set role = 'tailor' where user_id = '10000000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Preserved' where id = '10000000-0000-4000-8000-000000000002';
delete from public.profiles where id = '10000000-0000-4000-8000-000000000001';
delete from public.user_roles where user_id = '10000000-0000-4000-8000-000000000001';
insert into public.profiles (id, full_name)
  select id, left(coalesce(raw_user_meta_data ->> 'full_name', ''), 200) from auth.users on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
  select id, 'customer' from auth.users on conflict (user_id) do nothing;
do $$ begin
  if (select role from public.user_roles where user_id = '10000000-0000-4000-8000-000000000002') <> 'tailor'
    or (select full_name from public.profiles where id = '10000000-0000-4000-8000-000000000002') <> 'Preserved'
    then raise exception 'FAIL: backfill overwrote existing data'; end if;
  if (select role from public.user_roles where user_id = '10000000-0000-4000-8000-000000000001') <> 'customer'
    then raise exception 'FAIL: backfill did not restore customer'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ declare affected integer; begin
  if (select count(*) from public.profiles) <> 1 or (select count(*) from public.user_roles) <> 1
    then raise exception 'FAIL: cross-user read exposed'; end if;
  update public.profiles set full_name = 'Updated' where id = auth.uid();
  if (select full_name from public.profiles where id = auth.uid()) <> 'Updated'
    then raise exception 'FAIL: permitted name update failed'; end if;
  update public.profiles set full_name = 'Hacked' where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: cross-user update'; end if;
  begin
    update public.profiles set id = '10000000-0000-4000-8000-000000000003' where id = auth.uid();
    raise exception 'FAIL: profile ID writable';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set created_at = now() where id = auth.uid();
    raise exception 'FAIL: profile timestamp writable';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set updated_at = now() where id = auth.uid();
    raise exception 'FAIL: updated_at writable';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.profiles (id) values (auth.uid());
    raise exception 'FAIL: profile insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles where id = auth.uid();
    raise exception 'FAIL: profile delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.user_roles values (auth.uid(), 'admin') on conflict (user_id) do update set role = 'admin';
    raise exception 'FAIL: role upsert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.user_roles set role = 'admin' where user_id = auth.uid();
    raise exception 'FAIL: role escalation allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.user_roles where user_id = auth.uid();
    raise exception 'FAIL: role delete allowed';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated', 'public.tailorme_handle_signup()', 'EXECUTE')
    then raise exception 'FAIL: privileged signup function exposed'; end if;
end $$;

reset role;
update public.user_roles set role = 'admin' where user_id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: admin can read other profiles'; end if;
  begin
    update public.user_roles set role = 'admin' where user_id = '10000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: portal admin can assign roles';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.profiles;
    raise exception 'FAIL: anon profile read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.user_roles;
    raise exception 'FAIL: anon role read allowed';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('anon', 'public.user_roles', 'INSERT,UPDATE,DELETE')
    then raise exception 'FAIL: anonymous role writes granted'; end if;
end $$;
reset role;
rollback;
select 'PASS: portal authorization tests completed; fixtures rolled back' as result;
