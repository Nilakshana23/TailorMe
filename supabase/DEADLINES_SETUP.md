# Confirmed deadlines, completion and in-app reminders

No live migration, scheduler setup or deployment was performed.

## Exact prerequisites and order

Apply existing migrations 001–006 unchanged before these new migrations. Do not assume any prior file is live. The complete order is:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`
7. `20261027000700_confirmed_deadlines_notifications.sql`
8. Enable **Supabase Cron / pg_cron**, then apply `20261027000800_schedule_deadline_reminders.sql` as **postgres**.

All filenames are under `supabase/migrations/`. Confirm actual schema/history first; skip only confirmed applied files. Execute complete files once, one query at a time, in the intended Supabase project's SQL Editor as postgres. SQL Editor execution must be reconciled with CLI migration history before a later push. Stop and reconcile unexpected objects rather than dropping data. No extra environment variables, service-role frontend key, bucket or external delivery service is needed.

## Data and transitions

Existing `status` values and historical requests are preserved: pending, accepted, rejected, cancelled. Completion is an orthogonal work state derived from `completed_at`; completed inquiries keep their original accepted status and show **Completed** to both participants. The Accepted list filter consequently includes completed inquiries; active dashboard/deadline sections exclude them. No order is created and acceptance still does not agree a price/payment/date.

`preferred_date` stays the customer's original preference. It is never backfilled/copied into `confirmed_date`. Existing accepted work starts with no confirmed date. Only the addressed current tailor can set/change a confirmed date on accepted, incomplete work, choosing today or later in Asia/Colombo. Every change atomically increments the request version and deadline revision, records old/new dates, actor and timestamp in `request_deadline_history`, and invalidates old notifications. History is immutable to browser roles and readable only by request participants. The same date/version retry returns the saved result without duplicating history.

Only the addressed tailor can mark accepted, incomplete work completed. Completion records its timestamp and updates the request version atomically. Same-action retries are idempotent, stale opposing changes fail, and completed work cannot be rescheduled. Existing pending cancellation/accept/reject rules and participant RLS remain unchanged. Both participants can read confirmed date/history/completion after shop unpublication.

## Server scheduling setup (required for closed-app reminders)

[Supabase Cron](https://supabase.com/docs/guides/cron) uses pg_cron. Enable it in the project before applying 008. Migration 008 registers the named job **tailorme-deadline-reminders**, every **5 minutes**, executing `select public.run_deadline_reminders();` in the database. The same job name updates registration rather than duplicating it. No browser is involved in generating notifications. The scheduler's cron timezone can remain UTC; the worker derives calendar dates explicitly with `Asia/Colombo`.

The job must run as postgres, which owns the reminder functions. Execution of both the scheduler wrapper and timestamp-parameter worker is revoked from public/anon/authenticated. There is no client endpoint that can mint reminders or supply a fake clock. Do not grant API roles access to these functions. Only the dedicated recipient-read/mark-read paths are exposed.

Verify after authorized setup:

```sql
select jobid, jobname, schedule, command, username, active
from cron.job where jobname = 'tailorme-deadline-reminders';
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='tailorme-deadline-reminders')
order by start_time desc limit 20;
```

Expect exactly one active job owned by postgres, and successful executions. Monitor job duration/failures and database availability. The project must remain running; a paused database cannot run reminders. pg_cron installation/daemon execution is a live prerequisite and is not proven by local tests.

The worker locks each eligible accepted/incomplete request, then inserts persistent notifications for exactly confirmed-date minus 2 calendar days and the confirmed date. A unique `(request_id, revision, kind)` key prevents duplicate notifications across retries, overlapping executions and job reruns. It uses current confirmed dates/revisions, never preferred dates. Confirming one day away produces no retroactive two-day alert; confirming today can produce a due-day alert on the next run. Same-day revisions are separate schedules. Rescheduling and completion serialize on the same request row and invalidate old revision notifications (including unread counts); invalidated rows remain stored for history. Cancelled/rejected/pending/completed work is excluded. Overdue incomplete work is visible on the dashboard rather than generating additional stale daily reminders.

There is no catch-up for missed past reminder days. If scheduling is unavailable for an entire reminder day, or a date is confirmed after the day's last job run, that alert is skipped rather than sent stale the next day. A live job normally generates eligible notifications within five minutes. This is persistent **in-app** notification storage, not guaranteed device delivery: no push, email or WhatsApp is sent.

## UI and recipient privacy

The tailor dashboard queries real accepted incomplete work, upcoming confirmed deadlines (today onward) and overdue incomplete work (before today), up to 10 per section, with links to full request details. Unscheduled accepted work remains in Accepted Work. Date/history controls are visible to both participants but mutations are addressed-tailor-only. Customer preference and tailor-confirmed date are labelled separately.

The tailor portal's bell shows unread count, paginated notifications, request links and Mark as read. It loads on opening the portal, refreshes on focus/every minute and supports manual refresh. The browser never generates reminders. Notifications appear in-app when the tailor returns; opening a link does not silently mark it read. RLS permits only the recipient to read; the scoped mark-read RPC can only change that recipient's read timestamp. Raw INSERT/UPDATE/DELETE and changes to recipient/content are denied. Portal admins/customer/other-tailor accounts have no notification access. Invalidated notifications are omitted from the active list/count.

## Local tests and required live verification

Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` from `tailorme`.

Local PGlite runs all migrations and authorization suites. Migration 008 uses an explicitly mocked `cron.schedule` contract because PGlite has no pg_cron daemon. Tests verify job name/schedule/command and nonduplicating registration; they do not emulate time-driven execution. The deadline suite tests participant restrictions, private notification reads/writes, internal-worker API denial, version/idempotency checks, immutable date history, unchanged preferred dates, completion, rescheduling invalidation, no duplicate reminders, exact Sri Lanka midnight boundaries, short-notice and same-day confirmation, no stale catch-up and cancelled/completed exclusion. UI tests cover preference/confirmed-date separation, completed display and dashboard date classification. Do not run local fixture SQL against hosted projects.

Before releasing in a separate test project:

1. Apply the full chain and enable Cron before 008. Verify existing request/application/upload data and roles are unchanged and old accepted work has no invented confirmed date.
2. Confirm/change dates as the addressed tailor. Try direct RPC/table writes as customer, unrelated tailor, admin and anonymous; only participants can read history and only the addressed tailor can mutate accepted incomplete work. Customer sees old/new dates and timestamps.
3. Try concurrent reschedule/complete/job runs in separate database sessions. Confirm version conflicts, exactly one completion, no obsolete active notification and no duplicate `(request,revision,kind)` rows. Verify preferred_date remains unchanged.
4. With the app closed, confirm dates two days away, tomorrow and today. Wait for the actual cron run; inspect job_run_details and recipient notifications. Check Sri Lanka midnight boundaries and that tomorrow does not produce a stale two-day alert.
5. Reschedule after a reminder was generated. Old notifications must disappear from active list/unread count, while immutable date history remains. Complete work and verify no further alerts, including after scheduled reruns. Cancelled requests must never receive reminders.
6. Verify participant-visible completion timestamp/status, active/upcoming/overdue sections, bell unread count, paginated list and repeated Mark as read. Customer/other tailor/admin must not read or mark someone else's notification, including direct API requests with known UUIDs.
7. Check mobile/keyboard operation, retry/loading/empty/error states, closed-app generation versus later in-app viewing, and the absence of push/email/WhatsApp claims. Confirm browser clocks do not control server reminder dates.

No hosted Cron execution, actual multi-session race tests, browser/device checks, live SQL or deployment were performed locally.

Recorded local verification (2026-10-27): all 91 tests passed, including eight-migration authorization/workflow/date/reminder suites and the explicitly mocked Cron registration contract. Build passed with the existing >500 kB bundle warning; lint passed. No hosted setup or deployment was performed.
