# Tailoring progress — migration 010

No live SQL, Cron changes or deployment were performed.

## Prerequisites and exact execution order

New migration: **`supabase/migrations/20261027001000_tailoring_progress.sql`**.

Verify the intended project's actual schema and migration history. Apply these unchanged files once in order, skipping only confirmed applied migrations:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`
7. `20261027000700_confirmed_deadlines_notifications.sql`
8. Enable Supabase Cron/pg_cron, then `20261027000800_schedule_deadline_reminders.sql`.
9. `20261027000900_request_quotations.sql` (PostgreSQL 15+ view prerequisite).
10. `20261027001000_tailoring_progress.sql`.

All files are under `supabase/migrations/`. Run one complete file per SQL Editor query as postgres and confirm success before continuing. Reconcile unexpected existing objects without dropping data. Reconcile manual SQL execution with CLI migration history before future pushes. No applied migration is edited; no new environment variables, bucket, external delivery service or scheduled job is required. The existing deadline job remains unchanged. Coordinate backend/frontend rollout because the old unconfirmed two-argument completion call is now rejected.

## Separate states and eligibility

Request status (pending/accepted/rejected/cancelled), quotation status, and work stage remain separate. Both the request and its quotation must be accepted before the addressed current tailor can explicitly start at **Confirmed**. Quote acceptance does not fabricate a stage or timestamp. Existing accepted requests with no accepted quotation remain accessible with **Not started**; they cannot start the new progress workflow.

Stages are Confirmed → Designing → Stitching → Fitting → Ready → Completed. After Confirmed, any strictly forward move is allowed, including skipping stages. Ready means ready for collection; it does not record delivery or completion. Completed is terminal. Notes are optional (up to 1,000 characters) and explicitly customer-visible, never private tailor notes.

`progress_stage` stores only the active pre-completion stage. `work_stage` is generated: if the existing `completed_at` is set it reads Completed, otherwise it reads progress_stage. Thus there is one source of truth for completion. No old dates/stages are inferred from request acceptance, quotations, preferred dates, confirmed dates or completion timestamps.

`request_progress_history` records only real transitions: previous/next stage, request version, actor, timestamp and note. Unique request/version and request/stage constraints protect the history. Skipped stages do not get fake records. Existing completed requests keep their original completed_at, derive Completed, and retain an empty progress history. The UI explains that they predate tracking rather than inventing earlier transitions.

## Completion and reminders

Migration 010 renames the existing completion implementation to the internal-only `tailorme_complete_request_internal(uuid,integer)` and revokes browser execution. Its implementation remains the sole writer of completed_at and retains the established request version update and deadline-notification invalidation. The progress coordinator gates eligibility, authorization, current version and explicit completion confirmation, then calls this original implementation and records the real Completed transition with exactly the original completed_at timestamp. There is no second completion field or competing timestamp routine.

The public `complete_tailoring_request(uuid,integer,text,boolean)` delegates to the progress coordinator with the Completed target. The former two-argument call cannot bypass confirmation or eligibility; it now fails with an explicit-confirmation error. The old standalone completion button is replaced by the timeline's Completed action and confirmation checkbox/button. Accepted work without an accepted quote must obtain quote acceptance and start tracking before newly completing through this workflow. Existing completed work remains unchanged and readable.

Date changes, quotation snapshots, old request transitions, recipient privacy and Cron scheduling are preserved. Completion still stops reminders through the original logic. Progress alone does not treat a preferred date as confirmed or change a confirmed date. Reschedules and completion invalidate only deadline notifications, preserving quote/progress events.

## Authorization, retries and races

The progress RPC derives the actor from auth.uid(), checks the current trusted tailor role and addressed ownership, and locks the request row. It requires the expected request version and accepted quotation agreement. All mutations serialize on that same request lock with date changes, quote decisions and completion. Backward, repeated-with-new-version, stale, nonaccepted, unquoted and terminal-state changes are denied. Identical retries with the original version/target/note return the recorded result without another transition or notification. Changing the note on a stale retry cannot rewrite history.

Browser roles have SELECT only on history with participant RLS. Direct history writes, stage/ownership/version/completion edits and internal completion execution are denied. Only the customer and addressed tailor can read history; unrelated accounts, API admins and anonymous users cannot. A real transition inserts one persistent customer notification referencing the history event, with a unique event key preventing duplicate alerts across retries. Recipient-only notification RLS/mark-read remain unchanged. Notification delivery is in-app only, not push/email/WhatsApp.

Competing forward moves from the same version serialize: one wins and a different target loses with a stale-version error, even if it would otherwise be further forward. Identical competing requests are idempotent. Completion versus another stage/date update uses the same lock/version rules. Local tests exercise both serial orders; true multi-session scheduling still requires the live checks below.

## UI and local verification

Customer/tailor request details show a responsive six-stage timeline, current stage, real transition history, actor description, timestamps and customer-visible notes. The addressed tailor gets a forward-only stage selector, note field, busy/error/success feedback and explicit completion confirmation. The timeline distinguishes recorded/skipped/unrecorded stages rather than claiming every step occurred. Request lists and dashboard work cards separately show request-status badges and work-stage text.

Run from `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

Local PostgreSQL suites apply all ten migrations with mock Auth/Storage and a mock Cron registration contract. A genuine pre-010 completed fixture is inserted before migration 010 to verify preservation without invented history. The progress suite tests eligibility, participant/role restrictions, raw-write/internal-function denial, initial Confirmed, every forward stage, optional skips, backward/stale/terminal denials, identical retries, differing-note conflicts, both serial orders of competing targets, unique transition/customer notification counts, actor/note history, completion confirmation, one completion timestamp source, agreement preservation and reminder shutdown. UI/service tests cover forward choices, state separation, completion request confirmation and expected versions. These tests do not contact hosted Supabase or prove real simultaneous-session execution/browser behavior. Do not run local SQL fixture files against a hosted project.

## Required live checks before release

1. Apply the exact chain in a separate test project. Confirm legacy completed requests keep their timestamp and no fabricated history, and accepted/unquoted requests remain accessible but not eligible. Verify existing request/quote/date/Cron flows and private data remain intact.
2. As customer, unrelated tailor, admin and anonymous, try reading known progress history IDs and calling mutation/internal completion APIs. Only participants may read; only the addressed current tailor can advance. Direct table writes must fail.
3. Accept a request and quote, explicitly start Confirmed, then try all forward stages and skips. Check actor, Sri Lanka timestamp and customer-visible note. Backward moves and notes above the limit must fail. Ready must be labelled ready for collection.
4. Retry each action after a lost response with the original version/note. Confirm one event/version/customer notification only. Changed notes or stale versions cannot replace history.
5. In separate sessions race different forward targets from the same version, in both orders. Exactly one commits; an identical concurrent retry returns that result. Race date changes and completion against stage changes; verify version conflicts and terminal completion. No event may be invented for a skipped stage.
6. Select Completed in the UI: confirmation must be required. Call both public completion signatures directly without confirmation and ensure no bypass. Successful completion must use the existing completed_at timestamp, generate one real event/customer notification and invalidate deadline reminders. Cron reruns must never remind completed work. Quote/progress notifications remain readable and accepted charges immutable.
7. Check customer/tailor timeline, notes, lists/cards, mobile layout, keyboard selection/checkbox confirmation, loading/errors/retry/success, notification bell and links. Verify request/quotation/work stages are labelled separately and no payments, delivery tracking, chat or order creation appears.

No live SQL, hosted multi-session checks or deployment have been executed.

Recorded local verification (2026-10-27): all 100 tests passed, including the ten-migration PostgreSQL authorization/workflow suite and pre-progress completion fixture. Build and lint passed. The existing Vite >500 kB bundle warning remains. True simultaneous hosted transactions, Cron daemon/browser/device checks and live deployment remain unexecuted.
