# Tailors ordering from other tailors

## Required execution order (not performed here)

1. Confirm migrations 001-027 are applied, including 026's Storage preflight metadata handling and 027's private avatars. Do not edit or re-run applied migrations.
2. Apply **`supabase/migrations/20261031002800_tailors_as_requesters.sql`** once, after 027, through the project's normal migration process.
3. Release the updated frontend only after migration 028 succeeds. No live SQL or deployment was performed by this implementation.

There are no new buckets, extensions, schedules, role assignments, keys or data backfills. No RLS policy, table grant, public shop visibility or avatar privacy is broadened. `CREATE OR REPLACE FUNCTION` retains the existing restricted execution grants. The migration is transactional and updates five existing request/reference entry points, using their latest definitions (including 026, not the older preflight implementation from 021).

## Identity and permissions

`tailoring_requests.customer_id` continues to mean **requester**, and `tailor_id` means **addressed service provider**, independent of the requester's portal role. The schema and original participants are preserved. Ordering does not write to `user_roles` or create another account. The form permits trusted customer and tailor roles and blocks self-ordering; the existing server-side self-check is also retained for direct RPC calls. Approval, publication, accepting-requests, validation and stable submission IDs remain enforced on the server.

Tailors can select optional private reference images through the existing reference reservation/upload/frozen-attachment pipeline. No data is shared automatically. The measurement/design wrapper permits tailor calls only with `p_share=false`, no measurement payload and no customer-designer selection. Designer/measurement routes and save RPCs remain customer-only. Existing original/measurement snapshots remain participant-readable and immutable.

The existing quote, message/image, design proposal, payment/receipt, bank-read, progress and deadline authorization already uses actual request identities. It is deliberately reused: requester answers/reporting depend on `customer_id`; provider actions additionally require `tailor_id=auth.uid()` and trusted tailor status where already required. A requester who happens to be a tailor cannot verify their payment, quote their own order, propose provider changes, confirm its date or advance its work. Frozen bank destinations and payment history remain intact. Private reads remain participant-only.

## Navigation and query behavior

- `/tailor/requests` and `/tailor/requests/:id`: **Received Requests**, scoped to `tailor_id`.
- `/tailor/orders` and `/tailor/orders/:id`: **My Orders**, scoped to `customer_id`.
- Existing tailor detail links resolve to the correct view by the actual participant identity and preserve query, hash and navigation state. A newly sent tailor order opens in My Orders details.
- Customer routes/navigation remain unchanged. The authentication return-path allowlist now explicitly includes these request views, while still rejecting external and malformed targets. Existing role guards enforce the destination's role.
- Directory loading waits for restored authentication and trusted role resolution. For tailors, `owner_id != session.user.id` is part of the existing authorized database query **before** exact counting and range pagination; no post-pagination filtering is used. Customer results are unchanged. Direct View My Shop/Shop Profile access remains available.
- All dashboard counts and priority/deadline queries retain explicit `tailor_id` filters. No outgoing payment or order totals are added to provider workload. Deadline reminders already target only the addressed `tailor_id`.
- Notification queries join the participant-visible request to determine requester identity, rather than guessing the link from role. Workflow anchors and unread/read behavior remain unchanged.

## Verification and remaining live checks

Final local results: production build passed, lint passed, and **210/210 tests passed**, including the PostgreSQL authorization/workflow suite and eight focused tailor-ordering tests. The build reports the existing bundle-size warning. No tests used a live project.

Automated coverage includes the local PostgreSQL migration/RLS suite, customer regression suites and `tests/tailor-ordering.test.mjs`. The new SQL suite exercises real RPCs and Storage policies with two approved tailors, a customer and an unrelated account: self/closed/unapproved rejection, stable retries, reference preflight/final metadata, requester quote/proposal decisions, chat images, bank and cash payment reporting, protected provider actions, bank destinations, private reads, terminal work and provider-only reminders. Frontend tests cover auth restoration, exclusion before counts/pages, incoming/outgoing query separation, role-preserving form submission and response-loss recovery, compatibility redirects, safe return paths and notification anchors.

Before releasing:

1. With normal authenticated accounts A and B, confirm both remain tailors before and after A sends an order to B. Verify A's directory omits A's shop with correct filtered counts/pages; B and customers still see A's public shop. Own-shop detail remains reachable without a request form.
2. Verify My Orders and Received Requests independently on desktop/mobile, including filters, pages, empty/error/retry states, keyboard navigation and sidebar reachability. Confirm outgoing due dates do not enter A's provider dashboard.
3. Exercise quotations, private reference/chat/proposal images, confirmed progress, bank/cash reports and receipt signing using A as requester and B as provider. Test direct RPC denial of requester attempts to perform provider actions and unrelated-token reads/signing.
4. Verify the Supabase REST relationship query `request_notifications -> tailoring_requests` returns the nested `request.customer_id` for each owned notification. Check incoming/outgoing payment, chat and design alerts open the correct view/anchor and mark-as-read remains functional.
5. Test interrupted uploads, lost responses, concurrent decisions and simultaneous cross-orders from two sessions; retry with the same IDs after a transaction conflict. Existing database row locks still serialize mutations; no lock or idempotency protections were removed.
6. Confirm no customer-only designer/measurement tools appear for tailors, selected-design browsing still works for customers, public shop images remain public and private avatars remain owner-only.

Browser visual verification remains unfinished because the earlier Windows browser URL policy check blocked access. No policy bypass was attempted. Live Auth, PostgREST and Storage HTTP checks were not run by the local test fixtures.

## Actual changed files

New:

- `supabase/migrations/20261031002800_tailors_as_requesters.sql`
- `supabase/tests/tailors_as_requesters.sql`
- `tailorme/tests/tailor-ordering.test.mjs`
- `tailorme/TAILOR_ORDERING_SETUP.md`

Updated:

- `tailorme/src/App.tsx`
- `tailorme/src/pages/TailorDirectoryPage.tsx`
- `tailorme/src/pages/RequestsPage.tsx`
- `tailorme/src/components/portal/PortalLayout.tsx`
- `tailorme/src/components/portal/RequestComposer.tsx`
- `tailorme/src/components/portal/CustomerRequestCard.tsx`
- `tailorme/src/components/portal/NotificationBell.tsx`
- `tailorme/src/components/portal/RequestPayments.tsx`
- `tailorme/src/components/portal/RequestQuotations.tsx`
- `tailorme/src/components/portal/RequestDesignProposals.tsx`
- `tailorme/src/services/shopService.ts`
- `tailorme/src/services/requestService.ts`
- `tailorme/src/services/workService.ts`
- `tailorme/src/utils/authNavigation.ts`
- `tailorme/tests/database.test.mjs`
- `tailorme/tests/portal-guards.test.mjs`

Production build output in `tailorme/dist` was regenerated by verification. Applied migrations 001-027 are unchanged.
