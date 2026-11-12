begin;
do $$ begin
 if not exists(select 1 from cron.job where jobname='tailorme-deadline-reminders' and schedule='*/5 * * * *' and command='select public.run_deadline_reminders();') then raise exception 'FAIL: schedule registration'; end if;
end; $$;
select cron.schedule('tailorme-deadline-reminders','*/5 * * * *','select public.run_deadline_reminders();');
do $$ begin if (select count(*) from cron.job)<>1 then raise exception 'FAIL: duplicate jobs'; end if; end; $$;
rollback;
select 'PASS: schedule registration contract (mock cron, no daemon)' as result;
