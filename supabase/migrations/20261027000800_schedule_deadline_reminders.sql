begin;
-- Enable Supabase Cron (pg_cron) before applying this migration as postgres.
-- Same job name updates the schedule instead of creating another job.
select cron.schedule('tailorme-deadline-reminders','*/5 * * * *','select public.run_deadline_reminders();');
commit;
