Current applicant UI: see [APPLICATION_ATTACHMENTS_FLOW.md](./APPLICATION_ATTACHMENTS_FLOW.md). Select files while filling the form; Save Draft/Submit creates the draft internally. The historical save-first UI instructions below are superseded.

﻿# Optional tailoring qualifications — migration 005

This guide supersedes older setup notes for qualifications only. No live migration or deployment was performed. Existing migrations are unchanged. Certificates are optional; new submissions still require 1–3 private work photos. Existing pending/approved applications remain valid with no certificates, and their original approval/rejection RPC is unchanged.

## Prerequisites and exact execution order

Use the intended Supabase project with Auth, Storage, `anon` and `authenticated` roles, and the existing application environment configuration. Check the actual schema and migration history first; do not assume 003 or 004 is live. Back up the project before a manual production migration. Resolve unexpected pre-existing objects or bucket names without dropping data.

Apply these complete files once, in this exact order, skipping only migrations confirmed already applied:

1. `migrations/20261026000100_portal_foundations.sql`
2. `migrations/20261026000200_tailor_applications.sql`
3. `migrations/20261026000300_tailor_profiles_directory.sql`
4. `migrations/20261026000400_private_evidence_optional_shop_photos.sql`
5. `migrations/20261027000500_optional_tailoring_qualifications.sql`

In Supabase SQL Editor as the project owner (`postgres`), run one entire file per query, confirm success, then continue. Each file owns its transaction. If only 001/002 are applied, apply unchanged 003, then 004, then 005. Never rerun old migrations, modify old SQL, or invent certificate/work-photo records for legacy applications. SQL Editor does not automatically reconcile CLI migration history; record manual executions before any later CLI push. Apply backend prerequisites before using the new frontend.

## Required live Supabase setup

Migration 005 creates `tailor-application-certificates`. In Storage configuration verify:

- **Public OFF**; never use `tailor-public` for certificates.
- File size limit **5,242,880 bytes** (the UI calls this 5 MB).
- Exact MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`; no wildcards or SVG.
- Global Storage ceiling at least 5,242,880 bytes.
- `certificate_files_*` policies installed on `storage.objects`, including restrictive guards and the no-update policy. Inspect any custom policies/roles and service-role endpoints separately.
- RLS enabled on `tailor_application_qualifications`; authenticated has column SELECT only and the scoped add/remove RPC grants. No direct write grants or public read policy.
- Existing trusted admin assignment and Auth settings remain in place. No new keys or environment variables are needed; never put a service-role key in the frontend.

The table stores course name, institute, optional free-text qualification/NVQ level and an owner-scoped object path. It stores no signed URL or certificate-number field. No public shop/directory API joins this table or copies these files. The public label remains **Application reviewed**. Certificates support review and are not automatically authenticated.

## Authorization and lifecycle

Add/remove RPCs derive the applicant from `auth.uid()`, require the trusted customer role, lock the application row and require its expected version and draft/rejected state. The lock serializes record counts and edits against submission/review; at most 3 records may be attached. Records contain mandatory nonblank course/institute fields, an optional level, and exactly one file path. Existing applications get no fabricated records.

Attachment validates the caller's path, private bucket, file existence, MIME and size metadata. Entering pending rechecks every attached certificate, but zero records passes. Original work-photo submission requirements still run. Raw record INSERT/UPDATE/DELETE is denied to browser roles. Pending/approved records and attached files cannot be changed, deleted or overwritten. Rejected records can be removed/re-added without clearing the rejection reason. Existing atomic customer-to-tailor approval is unchanged.

Applicant reads are limited to their folder; admins can read attached files only, with their current database role checked. Other users and anonymous callers cannot read metadata/files or mint signed URLs. Private previews/open links use 120-second signed URLs, refreshed while mounted, held only in component memory. [Supabase signed URLs](https://supabase.com/docs/guides/storage/buckets/fundamentals) are bearer links: someone given a valid link can use it until expiry, so do not share them. Authorization is checked when a new link is issued, not on each use of an already-issued link.

File cleanup calls the Storage API, never SQL DELETE against hosted Storage metadata. A failed attachment attempts to remove only its generated path. Storage DELETE guards protect every attached file, including draft/rejected attachments and lost-response successes. Detach must succeed before file removal. Clean Unused Certificates discovers at most 100 of the caller's unreferenced files older than one hour; repeat as needed. Advisory path locks serialize attachment/delete reference checks. Unreferenced uploads may still finish during a concurrent submission, but cannot attach to the now-pending application; cleanup can later remove them. No admin cross-user cleanup is granted.

## Local verification versus live checks

Run from `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` (or `npm` where allowed).

The local database runner applies all five migrations in order to ephemeral PGlite using minimal Auth/Storage schema fixtures. Historical suites run at their version. The new `tests/application_qualifications.sql` suite exercises RLS and direct RPC/Storage-metadata calls: ownership, anonymous/other-tailor denial, admin attached-only reads, invalid/missing/oversize files, PDF acceptance, detail constraints, count/version checks, pending/approved immutability, rejection/resubmission, cleanup, broad-policy guards, certificate-free approval and legacy compatibility. UI/service tests use real components and injected upload transports. They do not contact Supabase or prove actual Storage HTTP behavior, signed URL expiry, browser/mobile operation or multi-session transaction timing.

**Do not run the local SQL fixtures against a hosted project.** They deliberately manipulate mock Storage metadata and Auth fixtures. No real blobs, accounts or emails are involved locally.

Before releasing, use a separate Supabase test project and actual applicant A/B, tailor and admin sessions to check:

1. Apply the exact migration chain, including a project with only 001/002 initially applied. Confirm legacy pending/approved rows and roles survive, and legacy approval still works.
2. Upload each allowed format through Storage HTTP; reject SVG, incorrect MIME and files over 5 MB. Confirm PDFs open and images preview on mobile and with keyboard/screen reader.
3. A can add/remove in draft/rejected, at most 3 records; B/other tailor/anonymous cannot list, download, sign, mutate or delete A's files, including direct API calls. Admin can inspect attached details/files but cannot modify them or access orphans.
4. Submit with zero certificates and 1–3 work photos, then approve. Reject missing work photos. Submit with certificates, reject with a reason, edit/re-add certificates and resubmit; confirm reason retention until the existing save/resubmit transition.
5. Test pending/approved add/remove/overwrite/delete denial through direct APIs, expired/stale versions, and concurrent attach/detach/submit/review/delete requests in separate sessions. Verify max-three and final immutable references.
6. Verify 120-second link expiry, refresh authorization after admin demotion/sign-out, and no signed URLs in database or persistent browser storage. Already-issued bearer links last until expiry.
7. Interrupt an upload or fail attachment; confirm cleanup uses Storage API, removes only own unreferenced files, protects attachments after lost responses, and the one-hour cleanup excludes other users and attached files.
8. Confirm public directory/profile responses and UI contain no qualification fields, file paths, certificate numbers, verification claims or private images. Keep **Application reviewed**.

These live checks remain required and have not been executed. Do not deploy as part of this task.
## Recorded local result (2026-10-27)

- `npm.cmd test`: 54 tests passed, including the migration and database/Storage-policy fixture suites.
- `npm.cmd run build`: passed; Vite reports a bundle chunk above 500 kB.
- `npm.cmd run lint`: passed.
- No hosted Supabase migration, actual Storage HTTP test, manual browser/device check or deployment was performed. Required live checks are listed above.
