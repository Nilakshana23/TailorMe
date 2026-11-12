# Basic tailoring inquiries — migration 006

This feature creates inquiries only. Acceptance does not create an order or confirm price, payment or a guaranteed completion date. No payments, messaging, measurements, AI, uploads or automatic order creation are included. No live SQL or deployment was performed.

## Exact migration and prerequisites

New file: `supabase/migrations/20261027000600_tailoring_requests.sql`.

Verify actual schema and migration history first. Do not assume any earlier migration has been applied. With Supabase Auth/Storage and the existing `anon`/`authenticated` roles installed, apply these complete files once in order, skipping only files confirmed already applied:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`

Use the intended project's SQL Editor as `postgres`, one whole file/query at a time, confirming each success. Each file contains its own transaction. Existing migrations and data remain unchanged. Resolve unexpected existing objects/history without dropping data. Manual SQL Editor execution must be reconciled with CLI migration history before any later push. No new environment variable, bucket, service-role key or Auth provider setting is needed. Existing private upload setup still applies independently.

## Authorization and workflow

`tailoring_requests` stores participant IDs, garment type, description, quantity, preferred date, status, rejection reason, timestamps and version. Customer name and shop name are snapshotted from trusted database records on creation so the addressed tailor can see the name without gaining access to other private profiles. Snapshots do not change if names/shop publication change later.

Authenticated table access is SELECT only, limited by RLS to the customer and addressed tailor. Portal admins have no additional request access. INSERT/UPDATE/DELETE and ownership/status edits require the scoped RPCs; browser roles cannot execute arbitrary mutations. Existing Auth/profile/role/application/upload policies are unchanged. Participant reads do not depend on current publication, accepting-requests setting or current participant role.

`send_tailoring_request` derives the customer ID from `auth.uid()` and requires their current trusted customer role. It locks that role row to serialize same-customer retries, checks target tailor role and approved application, then locks/checks a published, accepting shop. It validates a nonblank garment type (up to 100 characters), description (10–4,000 characters), integer quantity 1–100 and future date, measured in **Asia/Colombo**. Frontend validation uses the same calendar timezone. The preferred date remains subject to tailor confirmation.

A UUID generated for each form submission is the primary key/idempotency key. Identical retries by the same customer return the original request, including after the shop becomes unavailable or the request has been decided. Reusing a key for other fields/target/customer is rejected. The form keeps the original ID/fields while a network result is uncertain; it checks for the saved request before allowing changed input. It never automatically issues a replacement UUID after an unknown result. Page reload loses that in-memory attempt; use My Requests to inspect any sent inquiry before starting another.

`decide_tailoring_request` locks the request and checks participant identity, current tailor role for acceptance/rejection, expected version and pending state. Customer-only cancellation and addressed-tailor-only acceptance/rejection are the only transitions. Rejection requires a nonblank 1–2,000 character reason. Decision and timestamps/version update atomically. An identical successful action retried with its original version returns its result; opposing/stale decisions cannot overwrite it. Acceptance/rejection can still occur after unpublishing; no new inquiry can be created for that unavailable shop. Row locks serialize competing cancellation/acceptance/rejection calls so only one transition wins.

Requests reference Auth users with restrictive foreign keys to preserve participant history; account-deletion/retention policy is outside this step. Owners must account for these references in any future deletion workflow.

## UI

Published shop pages expose the customer-only form when accepting requests. Portal navigation links customers to My Requests and tailors to Requests, with paginated real records and participant-only details. Detail pages show status, preferred date, customer/shop names, request fields, creation/update/decision timestamps and rejection reason. Customer cancellation and tailor response actions appear only while pending. Existing responsive layouts, cards, typography, form controls and design tokens are reused. Loading, empty/unavailable, retry, sending/decision, success and error states are provided. No placeholder request records or business totals are introduced.

## Local verification and live test steps

Run from `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

The new SQL suite `supabase/tests/tailoring_requests.sql` runs after all six migrations in ephemeral PGlite, using existing mock Auth/Storage fixtures. It tests ownership, other-customer/tailor/admin/anonymous denial, raw mutation denial, target eligibility, field/date/quantity validation, idempotent creates and decisions, stale opposing decisions, cancellation, required rejection reason, terminal states, names/timestamps, and access after unpublishing/unavailability. Component/service tests cover role-aware forms/navigation, request validation, timezone boundaries and RPC submission IDs/versions. These tests do not prove hosted network behavior or actual simultaneous multi-session execution.

Do not paste the local SQL fixture suite into a hosted project: it creates mock users and modifies local fixtures. No live database, Google/email flow, Storage upload or deployment is contacted by the tests.

Before release in a separate Supabase test project:

1. Apply the exact migration chain. Confirm old accounts, roles, applications, approvals and uploads still work. Verify request RLS is enabled and only SELECT plus the two RPC grants are available to authenticated users.
2. Use customer A/B, addressed tailor T, unrelated tailor U and admin sessions. Only A can create. Reject noncustomer direct RPC calls, forged ownership/direct INSERT/UPDATE/DELETE, unavailable/unapproved/unpublished/nonaccepting targets, invalid dates, empty/oversize text and quantities outside 1–100. Test today's date near Sri Lanka midnight.
3. Submit from a published accepting shop, inspect the real row in My Requests and T's Requests, and open detail URLs directly. B/U/admin/anonymous must not list/read or decide A/T's request through direct APIs.
4. Interrupt the create response after commit and retry the same submission UUID, including concurrent requests from two sessions. Expect one row and the same ID; changed payload/key reuse must fail. Test UI error retry without losing input, and inspect My Requests before attempting a new inquiry after a page reload.
5. T accepts/rejects pending only; rejection requires a reason. A cancels pending only. Try simultaneous accept/reject/cancel requests using the same initial version in separate sessions: exactly one transition/version increment must commit; conflicting stale calls fail. Retry the winning action with its original version and confirm no extra transition/timestamp update.
6. Unpublish or stop accepting after creation. A and T retain request details and can act on a still-pending request, but new inquiries fail. Confirm public browsing guards and existing shop/image visibility remain unchanged.
7. Verify responsive/mobile navigation, keyboard labels, errors, loading/empty/pagination states and successful create/decision notices. Acceptance must never imply a confirmed price, payment, deadline or order. No order row is created.

All live checks remain unexecuted. Do not apply live SQL or deploy as part of this task.

Recorded local verification (2026-10-27): all 89 tests passed, including the six-migration PostgreSQL authorization/workflow suites. Build and lint passed. Vite retains the existing warning for a bundle chunk above 500 kB. Hosted Supabase, actual simultaneous multi-session tests, manual browser/device checks and deployment remain unexecuted.
