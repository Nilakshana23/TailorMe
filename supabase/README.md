Latest request feature: [REQUEST_MESSAGES_SETUP.md](./REQUEST_MESSAGES_SETUP.md) documents participant-only text chat, migration 020, exact migration order, Realtime setup, local checks and remaining live checks. No live changes were applied.

Latest customer feature: [DESIGNER_SETUP.md](./DESIGNER_SETUP.md) documents the Dress Designer, migration `20261027001100_customer_designs.sql`, exact 001?011 order, private ownership/snapshots and required live checks. No live changes were applied.

Latest workflow: [PROGRESS_SETUP.md](./PROGRESS_SETUP.md) documents migration `20261027001000_tailoring_progress.sql`, exact 001?010 order, eligibility, completion compatibility and required live checks. No live changes were applied.

Latest feature: [QUOTATIONS_SETUP.md](./QUOTATIONS_SETUP.md) documents migration `20261027000900_request_quotations.sql`, the exact 001?009 prerequisites/order and required live quotation tests. No live changes were applied.

Latest extension: [DEADLINES_SETUP.md](./DEADLINES_SETUP.md) documents migrations 007/008, confirmed dates, completion and required server-side Cron setup after unchanged 001?006. No live changes were applied.

Latest feature: [TAILORING_REQUESTS_SETUP.md](./TAILORING_REQUESTS_SETUP.md) documents migration `20261027000600_tailoring_requests.sql`, exact 001?006 prerequisites/order and live inquiry workflow checks. No live SQL or deployment was performed.

# Latest application extension

Optional qualifications use migration 005. See [QUALIFICATIONS_SETUP.md](./QUALIFICATIONS_SETUP.md) for the exact 001 ? 002 ? 003 ? 004 ? 005 execution order, private certificate bucket setup, local verification scope and required live checks. No deployment or live database changes were performed.

# Portal foundations — manual database setup

Current photo rules are in migration 004: see [PRIVATE_WORK_PHOTOS_SETUP.md](./PRIVATE_WORK_PHOTOS_SETUP.md). It adds private application evidence and makes public shop photos optional. Apply 003 first if it has not been applied; never edit already-applied migrations. The older guides below describe their original versions and are superseded where photo requirements differ.

Tailor shop profiles and the public directory now have a third migration. Follow [TAILOR_DIRECTORY_SETUP.md](./TAILOR_DIRECTORY_SETUP.md) for the new SQL and Storage setup, public-image behavior, local test scope, and live verification. Already-applied migrations remain unchanged.

Tailor applications are now implemented in a second migration. See [TAILOR_APPLICATIONS_SETUP.md](./TAILOR_APPLICATIONS_SETUP.md) for the current migration order, application workflow, authorization tests, live verification, and owner-only first-admin setup. The foundation instructions below describe the original migration; do not rerun it if it is already applied. SQL tests now also run locally via PGlite, but no SQL has been run against the live Supabase project by the agent.

The repository had no migrations before this change. No live Supabase database connection or database CLI is configured in this workspace. **The migration and SQL authorization tests have not been executed against a database.** Apply this migration before testing portal login; until then the UI intentionally shows an error with Retry rather than guessing a role.

## Apply using Supabase SQL Editor

1. Open the intended Supabase project dashboard. Confirm the project matches the frontend's configured project (do not share or copy secret keys).
2. Open **SQL Editor → New query**, using the `postgres` owner role. Copy the entire contents of `supabase/migrations/20261026000100_portal_foundations.sql` into the editor and click **Run**. It includes its own transaction. Run it once; it is a versioned migration, not a repeatable setup script. If a table or function already exists, stop and reconcile the existing schema instead of dropping data.
3. Confirm success. In Table Editor, check `public.profiles` and `public.user_roles`. Each existing Auth user should have a profile and one role. Existing metadata is used only for the name; every newly assigned role is `customer`.
4. Open **another new SQL query** as `postgres`. Paste all of `supabase/tests/portal_authorization.sql`, then click **Run**. Expect `PASS: portal authorization tests completed; fixtures rolled back`. Any SQL error or `FAIL` means the tests did not pass. Tests create two temporary Auth-user fixtures inside a transaction and end with `ROLLBACK`; they do not send emails. Use a test project first. If a fixture UUID happens to exist, use different UUIDs throughout the test rather than removing real users. After an interrupted test transaction, execute `ROLLBACK;` before retrying.
5. Restart the frontend if environment configuration changed, then sign in. Existing sessions can use **Refresh portal access**, or reload the page.

Do not execute the migration again through a future CLI migration push without reconciling Supabase migration history. The SQL Editor does not automatically track local migration filenames.

## Owner-only role assignment

Open `supabase/examples/assign_test_role.sql`. In a new SQL Editor query as `postgres`, replace BOTH UUID placeholders with an existing test user's UUID from **Authentication → Users**. Set the role to `tailor` or `admin`, review the exact UUID/role, and manually run the query. This example has not been executed automatically. Set the role back to `customer` using the same statement to remove privileged portal access. Refresh portal access or sign out/in to load the new role.

Public signup has no role selector. Signup metadata, including an attempted `role: admin`, is ignored for authorization. A portal admin has no database-owner powers and cannot assign roles through the browser.

## Authorization model and tests

- `profiles.id` and `user_roles.user_id` reference `auth.users.id` with cascade deletion. Roles are constrained to one of `customer`, `tailor`, `admin`, one row per user.
- Signup uses a security-definer trigger with an empty search path and fully qualified tables. API roles cannot execute its function. Backfill uses `ON CONFLICT DO NOTHING` independently for profiles and roles.
- RLS permits authenticated users to select only their own rows. Only `profiles.full_name` has an UPDATE grant; IDs and timestamps cannot be set by browser clients. A trigger maintains `updated_at`. Clients cannot insert/delete profiles or insert/update/delete/upsert roles. Anonymous clients have no table privileges.
- The SQL test covers malicious metadata, profile creation, backfill restoration/preservation, own reads/name edits, cross-user read/write isolation, protected columns, profile/role write denial, privilege-function exposure, anonymous denial, and the absence of role-management powers for portal admins.
- Frontend guards are UX, not the database security boundary. Future order/reporting APIs require their own authorization policies. These foundations intentionally do not grant admin access to other profiles or build management APIs.

The implementation follows Supabase's [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [user-data trigger guidance](https://supabase.com/docs/guides/auth/managing-user-data).

## Local checks and remaining live verification

From `tailorme`, run `npm test`, `npm run build`, and `npm run lint` (`npm.cmd` on Windows if PowerShell blocks npm.ps1). Component tests compile the real TSX in memory, provide test auth/role context, and disable Supabase transport; they do not read environment values or contact Supabase. They cover matching/wrong-role rendering, unresolved/missing/error states, session guards, real profile display, and honest dashboard empty states. They do not replace browser interaction or SQL tests.

After applying SQL, verify:

1. Fresh signup (including an API signup containing privileged role metadata) creates a customer profile/role. Confirmation login and ordinary login land on `/customer/dashboard`; existing users are backfilled.
2. Assign test users tailor/admin via the owner example. Verify login and email-confirmation routing to the correct dashboard for each. Visit every other portal URL directly and refresh: wrong-role content must not render. Logged-out portal visits must go to `/login`.
3. Check `/account` name/email and dashboard link for each role. Check logout, session restoration, account switching, mobile menu open/close/Escape, narrow layouts, and keyboard navigation. Welcome/reference files remain intact.
4. In a test project, temporarily remove a profile or role as owner. Verify missing states and Retry after restoring it. Simulate failed profile/role requests using browser devtools; no portal should render until a successful retry.
5. Using the signed-in user's browser client, attempt direct role insert/update/delete/upsert and another user's profile read/update; verify denial/empty reads, not just hidden UI. Verify own full-name update succeeds while ID/timestamp writes fail. Do not use a service-role key for these checks.
6. Recheck signup/login errors, confirmation links, forgot-password emails, recovery update, invalid/expired links, and old/new password login. Existing Auth URL settings in `tailorme/AUTH_SETUP.md` still apply.

The original foundation setup does not assign an owner admin or deploy. The new tailor-application feature uses scoped database RPCs for customer submissions and admin review; see the application setup guide above.
