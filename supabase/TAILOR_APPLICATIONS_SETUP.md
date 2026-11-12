# Tailor applications and admin approval

**Current submission requirements:** after migrations 003 and 004, new submissions/resubmissions require 1–3 private work photos. Existing pending/approved applications remain valid without evidence. See [PRIVATE_WORK_PHOTOS_SETUP.md](./PRIVATE_WORK_PHOTOS_SETUP.md) for the exact migration order, private bucket, permissions, and live verification. Older instructions below describe the initial business-field workflow.

## What to apply to Supabase

No migration, role assignment, or SQL test has been run against your live Supabase project by this task. The automated tests run both migrations and SQL suites in an ephemeral local PGlite PostgreSQL instance with a minimal `auth.users` / `auth.uid()` fixture. This verifies SQL execution and authorization logic locally; it does not verify your hosted project, PostgREST configuration, Auth emails, or live concurrent requests.

The applied foundation migration is unchanged. Apply these in order:

1. `supabase/migrations/20261026000100_portal_foundations.sql` — **only if not already applied**.
2. `supabase/migrations/20261026000200_tailor_applications.sql` — the new migration.

In the intended Supabase project, open **SQL Editor → New query**, select the `postgres` owner role, paste the entire NEW migration, and click **Run**. It includes `BEGIN` / `COMMIT`. Run it once. If objects already exist, reconcile the schema/migration history rather than dropping tables or rerunning blindly. The SQL Editor does not record the local filename in CLI migration history; reconcile history before switching to `supabase db push` later.

After it succeeds, open a separate query as `postgres` and run each entire test file:

- `supabase/tests/portal_authorization.sql`
- `supabase/tests/tailor_applications.sql`

Use a test project first. Each suite inserts throwaway Auth fixtures, tests as `anon` / `authenticated` with simulated JWT subjects, and ends in `ROLLBACK`. It does not send emails. Expect a final `PASS:` row; any SQL error or `FAIL` means the suite failed. If a fixed fixture UUID already exists, replace it consistently throughout the test rather than deleting a real user. If execution stops with an open transaction, run `ROLLBACK;` before retrying. The application suite temporarily installs a failing trigger inside its test transaction to verify atomic rollback; run the whole file so cleanup occurs.

Refresh the frontend after applying the migration. No new environment values, database password, Google secret, or service-role key are needed.

## Choose the first admin (owner only)

The separate example is `supabase/examples/assign_first_admin.sql`. It has **not** been executed. In **Authentication → Users**, copy the UUID of your chosen existing account. In a new SQL Editor query as `postgres`, paste the example and replace BOTH UUID placeholders with that UUID. Review the account and SQL before manually clicking **Run**. Then sign out/in or use **Refresh portal access**. Never put this owner SQL or a service-role key in frontend code.

Public signup remains customer-only. Only an owner can designate the first admin or assign arbitrary roles. An app admin can approve a pending customer's tailor application; they cannot turn someone into an admin or demote an existing admin.

## Workflow and security

- Each Auth user has at most one application, keyed by `applicant_id` with cascade deletion. Drafts can be incomplete. Submission requires shop name (2–160), phone (7–15 digits, permitted punctuation, maximum 32 characters), city (2–120), address (5–500), description (20–4,000), specialties (2–500), and integer experience (0–80 years). Text is rendered as text, never HTML.
- New applications may be saved as `draft` or submitted as `pending`. Drafts can be edited or submitted. Rejected applications can be edited and submitted directly, or saved as a draft. Saving/resubmitting clears the previous decision fields. Pending applications cannot be edited. Only pending applications may become `approved` or `rejected`. Approved applications are terminal.
- Each decision stores `reviewer_id`, `reviewed_at`, and a required reason on rejection. Reviewer deletion is restricted while an application references that reviewer, preserving the reviewer identity. This is a current-decision record, not an immutable history of every prior rejection.
- RLS allows own-application reads and admin reads via a one-way lookup in the existing own-role policy. It does not reference applications from a role policy, so it does not recurse. Customers cannot read other applications. Tailors can still read their own approved record.
- There are **no browser table write grants** on applications and no changes to the restrictive `user_roles` policies. `save_tailor_application` derives the applicant from `auth.uid()`, rechecks their customer role, and accepts only business fields, submit intent, and expected version. No applicant/reviewer/approval fields can be injected.
- `review_tailor_application` derives the reviewer from `auth.uid()` and verifies the caller's current `admin` row inside the database. It accepts only approved/rejected, pending applications, current version, and applicants whose current role is customer. An approval atomically sets the role to tailor and records approval; rejection leaves the role customer. Admin/tailor roles are never changed by review. Missing, stale, invalid, and repeated decisions fail.
- Both exposed functions are security definers with an empty search path and fully qualified relations. Public/anonymous execute access is revoked, and authenticated execution is explicitly granted only to the scoped RPCs. Each function independently enforces its own authorization. Internal trigger execution is not exposed. This follows [Supabase function-hardening guidance](https://supabase.com/docs/guides/database/functions).
- A transition trigger enforces the state graph, immutable applicant ID, pending business details, and server-maintained timestamps/version. Role rows are locked before application rows; versions reject stale edits/reviews. Two decisions cannot both commit for the same pending version. Row-level concurrency should still be exercised against the hosted project.

## UI and live checks

Customers open **Become a Tailor** from desktop/mobile navigation. Signup explains that they must create a customer account first. `/become-a-tailor` is customer-only; `/admin/tailor-applications` is admin-only. Wrong-role routes use the existing dashboard resolver. Navigation has correct active-page indicators.

1. As a customer, save a partial draft, leave, return, and verify persistence. Complete it and submit. Verify pending details are read-only, including after refresh.
2. As another customer, confirm no access to the first customer's record through direct API queries. Direct application writes and role writes must fail. Try the review RPC as customer/tailor and confirm denial.
3. As the designated admin, open the management screen. Verify pending/default and other status filters, empty states, paginated lists, details, error/retry, and reload behavior.
4. Reject with a required reason. As the applicant, reload to see the reason, edit, and resubmit. Saving a draft intentionally clears the old decision. Check required fields, bounded lengths, phone, and experience validation.
5. Approve a pending application. Verify `reviewer_id` and decision time, approved status, and the customer-to-tailor role change. Applicant clicks **Refresh Role & Portal Access** and reaches `/tailor/dashboard` with the same account. A full reload/login also loads the new role.
6. With two admin tabs, try decisions for the same version. Only one may succeed. Reject/re-submit an application while another tab holds old details: the stale decision must fail until reload. Test repeat clicks and failed network responses; reload before retrying an uncertain result.
7. As owner in a test project, promote an applicant to admin before reviewing their old pending application. Review must fail without changing the admin role. Do not perform this on an unrelated real account.
8. Recheck customer/admin/tailor navigation on narrow widths, keyboard and Escape behavior, logout, role refresh, signup, Google login, password login/recovery, and welcome page. Business metrics stay empty until those separate features are implemented.

## Automated checks

From `tailorme`, run `npm test`, `npm run build`, and `npm run lint` (`npm.cmd` if PowerShell blocks npm.ps1). `npm test` includes the local PostgreSQL suite plus component/validation tests. PGlite is a development dependency only and is not imported into the browser application.

SQL tests cover identity isolation, grants, unauthorized RPC calls, draft/submit/reject/resubmit/approve, invalid fields, pending edit locks, version conflicts, audit fields, direct privilege escalation, admin-role preservation, and a forced failure proving the role change rolls back atomically with the application. Tests use an Auth fixture locally, not a hosted Supabase connection. Browser interactions, Google/email flows, hosted RLS/PostgREST behavior, and concurrent transactions remain live verification tasks.

No deployment or automatic first-admin assignment is included.
