# Request quotations — migration 009

No live SQL, provider/scheduler changes or deployment were performed.

## Prerequisites and exact order

Apply existing migrations unchanged, after verifying actual schema/history. Do not assume any previous migration is live. Run one complete file per SQL Editor query as postgres; skip only confirmed applied files:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`
7. `20261027000700_confirmed_deadlines_notifications.sql`
8. Enable Supabase Cron as described in DEADLINES_SETUP.md, then `20261027000800_schedule_deadline_reminders.sql`.
9. **`20261027000900_request_quotations.sql`** (new).

Files are under `supabase/migrations/`. Reconcile unexpected objects without dropping data. Manual SQL Editor execution must be reconciled with CLI migration history before a later push. Migration 009 requires PostgreSQL 15+ for its security-invoker view (supported by current Supabase projects). No new environment variable, bucket, service-role frontend key, notification transport or Cron job is needed. Existing deadline scheduling remains unchanged.

## Amounts, versions and agreement

Only the addressed current tailor may send a quote on an accepted incomplete request, using the request's expected version. Currency is LKR, and all charges cover the whole request quantity, never a per-item multiplication. Stitching, material and other charges are nonnegative; total must be positive. Other charges above zero require an explanation. Explanation is limited to 1,000 characters; notes to 2,000.

RPC amount arguments are decimal **strings**, exactly two fractional digits, at most 999999999.99 per charge. Negative, exponent, NaN/Infinity, null, excessive precision and oversize values are rejected before casting. The form normalizes ordinary decimal input (e.g. 12 to 12.00) without floating-point arithmetic. Numeric(14,2) fields and a generated total calculate exact amounts server-side. `quotation_details` casts all money to strings under a security-invoker view, preserving participant RLS; the UI formats these strings without summing/rounding in JavaScript. Clients cannot supply totals.

A stable UUID identifies each send attempt. Identical retries return the same quote and do not duplicate notifications. Different payloads cannot reuse an ID. The form retains its ID/amounts after an ambiguous failure; retries and Refresh quotations reconcile stored history. Explicit PostgreSQL transaction failures allow correcting fields; leaving/reloading the page loses local attempts, so inspect quotation history before starting another.

Every new quotation gets a monotonically increasing quote_number under the request-row lock. A partial unique index enforces one outstanding quote per request. Withdraw an unanswered quote to revise; withdrawn/declined versions remain readable in history. Customer acceptance creates an immutable `request_quote_agreements` snapshot with exact charges, total, explanation, notes, currency, quote version and customer/time. The accepted quotation itself also remains immutable to browser callers. No accepted quote can be replaced in this step. Acceptance does not make a payment, charge a commission or create an order.

Request acceptance remains separate from quotation acceptance. Quote operations do not change request status, preferred/confirmed dates, request version, completion or deadlines. A customer may accept only while the request remains accepted and incomplete. If work completes while a quotation is unanswered, it can still be declined/withdrawn, but not accepted; existing completion is never blocked by quotations.

## Security and race behavior

Tables grant authenticated SELECT only. Their RLS permits only the request's customer and addressed tailor; unrelated users, API admins and anonymous visitors have no access. The view uses caller RLS, not owner bypass. Agreement/history raw writes, ownership edits, arbitrary status changes and direct quotation INSERT/UPDATE/DELETE are denied. Privileged database-owner maintenance remains outside browser authorization.

Send and answer RPCs lock the request row, serializing quote numbers/outstanding checks against other sends and completion/date changes. Answer additionally locks the quote, verifies its expected version and outstanding state, and derives the actor from auth.uid(). Only the request customer can accept/decline; only the addressed current tailor can withdraw. Identical winning-action retries return the stored result. Competing accept/withdraw calls serialize: the loser sees a stale version; it cannot erase an agreement or overwrite the winning status. The one-accepted-quote index and unique per-request agreement provide additional invariants.

## Notifications and preserved deadlines

The existing recipient-only `request_notifications` table and mark-read RPC are reused. Each sent quote inserts one customer `quote_sent` notification; accepted/declined answers insert one tailor event. A unique `(quote_id,kind)` index plus transaction/idempotency checks prevents duplicate notifications. These are persistent in-app events only; no push, email or WhatsApp is sent. The bell is now available to both customers and tailors and links to their request details.

Migration 009 expands notification kinds and permits null deadline-only fields for quote events, with a shape CHECK separating quote and deadline rows. Existing notifications remain intact. It replaces the existing confirmed-date/completion functions only to limit notification invalidation to deadline kinds; all authorization, request version checks, history, completion and reminder behavior are retained. Rescheduling/completion must not invalidate quotation events. The scheduler still generates only two-day/due-day reminders and is not called by quotation code.

## Local and required live verification

Run in `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

The database runner applies all nine migrations to local PGlite with mock Auth/Storage and a mocked Cron registration contract. The new suite tests participant/role denial, raw-write denial, decimal precision/negative/zero/NaN/exponent/maximum amounts, exact string totals, required other-charge explanation, one outstanding quote, history numbering, withdraw/revise/decline/accept, immutable agreement snapshot, stale request/quote versions, idempotent sends/actions/notifications and both serial outcomes of conflicting accept/withdraw decisions. It also checks that date changes/completion preserve quote events and that deadline generation/invalidation still works. UI/service tests cover decimal string normalization, whole-quantity/no-payment copy and RPC IDs/versions without a supplied total. Local serialized tests do **not** prove actual simultaneous hosted transactions or real network/HTTP delivery.

Do not run local fixture SQL against a hosted project. It creates fake local accounts and mutates mock data.

Before release, use a separate Supabase test project:

1. Apply the exact chain, confirm existing data/statuses/deadline history/notifications survive and Cron remains healthy. Verify the money view uses security_invoker and participant RLS. Confirm no raw browser write grants exist.
2. As addressed tailor, send a quote with decimal charges for a multi-item accepted incomplete request. Verify LKR charges cover the whole quantity, generated exact total and one customer in-app event. Reject nonaccepted/completed requests, wrong tailor/admin/customer/anonymous calls and stale request versions, including direct APIs.
3. Try negative/zero-total/null/exponent/NaN/overprecision/oversize charges and missing other-charge explanation; confirm server denial even if frontend validation is bypassed. Verify 0.10 + 0.20 + 0.30 = 0.60 and maximum totals return exact strings.
4. Submit the same UUID concurrently and after a lost response: one quote/history version and one event only. Reuse that UUID with different fields and verify denial. Try simultaneous sends with different IDs: only one outstanding quote may commit.
5. Withdraw unanswered, send a revised version, decline it, then send and accept another. Both participants see the history; unrelated users/admin/anonymous cannot list/read or mutate quotes/agreements with known IDs. Accepted totals/notes cannot be edited or replaced.
6. In separate customer/tailor sessions, accept and withdraw the same outstanding version simultaneously. Exactly one wins; the other receives stale/conflict denial. Repeat in both orders, and retry the winning action: no extra status/version/notification/agreement. Also race completion against send/accept; no quote can be newly sent or accepted after completion wins.
7. Check customer/tailor bells, exact breakdown/agreed total/status/notes, loading/empty/errors/retries, keyboard/mobile form use, and no payment/commission/order creation. Check that old role-based guards, request decisions, confirmed dates, completion and reminders still work. Reschedule/complete after quote events and verify those events remain active while obsolete deadline reminders are invalidated.

No hosted multi-session races, actual Supabase HTTP flows, manual browser/device checks, live SQL or deployment have been performed.

Recorded local verification (2026-10-27): `npm.cmd test` passed all 97 tests, including nine-migration authorization/workflow suites, exact amount checks and both serial orders of conflicting decisions. `npm.cmd run build` and `npm.cmd run lint` passed. Vite retains the existing >500 kB bundle warning. Actual simultaneous hosted transactions and live HTTP/browser checks remain unexecuted.
