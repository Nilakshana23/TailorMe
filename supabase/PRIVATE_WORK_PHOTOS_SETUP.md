Current applicant UI: see [APPLICATION_ATTACHMENTS_FLOW.md](./APPLICATION_ATTACHMENTS_FLOW.md). Select files while filling the form; Save Draft/Submit creates the draft internally. The historical save-first UI instructions below are superseded.

# Private application work photos and optional public shop photos

## Apply to live Supabase

No live SQL, bucket, account, or file was changed by this task. A new migration changes the rules without modifying any previously applied migration:

`supabase/migrations/20261026000400_private_evidence_optional_shop_photos.sql`

Apply migrations in this exact order, skipping those already applied:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`

If the shop-profile migration (003) has not yet been applied, apply it unchanged first, then 004. Do not edit the old migration to remove its cover requirement: 004 removes that requirement and replaces the cover-removal function. It preserves every application, role, profile, portfolio, and public file. No evidence is invented or copied into existing applications.

In the intended Supabase project's **SQL Editor → New query**, as `postgres`, paste each required migration's entire contents and click **Run**, one at a time in the order above. Each includes a transaction and is intended to run once. Do not rerun old migrations or drop existing data to work around conflicts. If objects or bucket names unexpectedly exist, reconcile schema/migration history first. SQL Editor does not automatically track local migration filenames for future CLI pushes.

## Bucket configuration

Migration 004 creates **`tailor-application-evidence`** with:

- **Public: OFF** (private).
- Maximum file size: **5,242,880 bytes (5 MiB)**.
- MIME allowlist: **image/jpeg**, **image/png**, **image/webp**, without SVG or wildcards.

Verify these values in **Storage → tailor-application-evidence → Configuration**, and ensure the global Storage size ceiling is at least 5 MiB. Do not make this bucket public. Do not put evidence in `tailor-public`. The existing public bucket is unchanged and remains solely for optional, intentionally public shop/portfolio images. No new environment variable or service-role key is needed.

Verify the `evidence_files_*` policies on `storage.objects`. They grant only applicant-owned editable uploads, applicant/admin reads, and deletion of the caller's unreferenced files. They deny updates/overwrites. Restrictive guards prevent older broad permissive policies from exposing this bucket or bypassing its ownership rules. They leave unrelated bucket policies intact. Review any project-specific policy not using these normal anon/authenticated roles separately.

The app uses [Supabase signed URLs for private previews](https://supabase.com/docs/guides/storage/buckets/fundamentals), valid for **120 seconds**, refreshed while the preview is mounted. Signed URLs exist only in component memory; they are never stored in the database, browser persistence, or logs. They are bearer links: anyone given an already-issued link may use it until expiry. Do not share them. A new preview URL requires a fresh Storage SELECT authorization check. These tests do not prove hosted URL expiry or immediate revocation of previously issued links.

## Workflow and legacy compatibility

- Applicants first save a draft, then upload 1–3 photos of garments/work they have made. Ordinary phone photos are acceptable. Accepted formats and size are validated before upload; the bucket enforces MIME/size restrictions for direct API uploads as well. These photos support application review and **do not prove skill or identity**. There are no video calls and no customer-reference feature.
- Drafts may have no photos. Entering `pending` now requires 1–3 attached records backed by existing, correctly scoped Storage objects with valid MIME/size metadata. Submission rechecks file existence. Evidence count, caller identity, role, application version, and editable state are checked in the database; UI validation is not the security boundary.
- Pending and approved applications/evidence are immutable to applicants. Rejected applications may edit/remove/add photos and resubmit; photo edits retain the current rejection reason. The existing save/resubmit flow resets decision fields only when starting a new draft/review cycle, as before.
- The requirement is enforced only when a new or rejected/draft application **enters pending**. Existing pending/approved applications remain valid with zero photos. Their admin view displays **No evidence provided**. Existing pending applications can still be approved without fabricated evidence; a rejected legacy application needs photos when resubmitted.
- Evidence is in a separate table with no browser write grants. Scoped RPCs derive the applicant from `auth.uid()` and lock the application row, serializing evidence changes with submission/review. A maximum of three attachments is enforced under that lock. Raw table writes and foreign-owner paths are denied. Auth metadata is never used to authorize roles.
- Applicants may read their own evidence, including after becoming tailors. Other customers, other tailors, and anonymous users cannot read its metadata or objects. Admins can read only attached evidence through a current trusted `user_roles.admin` check; they cannot edit/delete evidence or inspect other applicants' unreferenced uploads. Losing admin status prevents issuing new preview URLs.
- Approval still uses the original hardened `review_tailor_application` function: the application decision and customer-to-tailor role change remain atomic, with reviewer/time recorded and invalid/repeated decisions rejected. It is not replaced or weakened by this migration.

## Upload/cleanup behavior

Evidence names are unique UUIDs in `<applicant-uuid>/work/<random-uuid>.jpg|png|webp`. Uploads use the shared SDK-managed session and the private bucket. Attachments check ownership, bucket, file existence/metadata, and editable status. Storage overwrite is denied. An upload that finishes during a concurrent submission may remain unreferenced, but cannot be attached to the now-pending application.

If upload/attachment fails, the client attempts to remove only its newly generated, unreferenced path. A lost attachment response cannot make cleanup delete an attached photo: the Storage DELETE policy protects **every attached photo**, including drafts/rejections, until a successful editable-state detach. Detach and later Storage deletion are separate requests; partial failures show an actionable message instead of pretending the file was removed.

**Clean Unused Work Photos** discovers only the caller's unreferenced private files older than one hour, at most 100 at a time. This covers browser crashes/interruptions without persisting URLs. It excludes attached pending/approved photos and other users' files. Repeat cleanup if more files remain. Advisory locks serialize attachment/file-delete reference checks. No Storage file is deleted by SQL or a service-role cleanup job; actual removal uses the Storage API. Owners must use the Storage dashboard/API to handle abandoned files after account deletion.

## Public shop changes

Complete business details remain required for publication, but public cover/portfolio photos are optional. Photo-free shops get a branded shop-initials placeholder and the same directory filters, sorting, pagination, and eligibility as shops with photos. Removing a cover preserves publication. Public portfolio copy says **Photos of your work (optional)**.

Private evidence is never automatically copied to a public cover or portfolio. Public RPCs also reject evidence-folder paths. The public label is **Application reviewed**, never a claim of skill verification or a quality guarantee. `tailor-public` remains public by URL before/after publication; private review evidence must stay in the separate private bucket.

## Local tests and remaining live verification

From `tailorme`, run `npm test`, `npm run build`, and `npm run lint` (`npm.cmd` if PowerShell blocks npm.ps1).

The database runner applies migrations in order to ephemeral PGlite with minimal Auth/Storage schemas. Historical suites run at their schema version. It creates genuine pre-004 pending/approved fixtures before applying 004, then runs `supabase/tests/private_application_evidence.sql` to test compatibility and the new rules. The fixtures and new suite are **local only**: never paste them into a hosted project's SQL Editor, because they deliberately manipulate mock Storage metadata. No real accounts, emails, or blobs are involved. UI checks render the real components with test contexts; upload tests inject transports rather than contacting Supabase.

Locally covered: draft/submission counts, three-photo maximum, invalid/missing files, metadata MIME/size validation, applicant isolation, admin attached-only access, anonymous/other-tailor denial, pending/approved locks, rejection/resubmission, protected attachments, caller-scoped orphan cleanup, restrictive-policy protection, legacy approvals, original atomic review behavior, no automatic public copies, optional photo publication, and cover-removal publication preservation.

After applying 004, verify live using two applicants, an admin, another tailor, and an incognito visitor:

1. Save an empty draft, upload a real phone photo, view/refresh its signed preview, remove it, and add 1–3 photos. Test the fourth photo, invalid formats, zero-byte and oversized files, and mobile keyboard/touch controls. Check real progress and failure/retry states.
2. Submit with zero photos through the direct save RPC: it must fail. Submit with valid evidence: it must succeed. Test other-user paths, missing objects, stale versions, and direct evidence-table writes. Pending file upload/attach/detach and overwrites must fail.
3. As another customer/tailor/visitor, attempt Storage download and signed-URL creation for evidence: deny access. An admin should preview attached evidence, but not unreferenced files or remove evidence. Confirm signed previews expire and are never saved as database values.
4. Attempt direct Storage deletion of attached pending/approved photos as applicant/admin: files must remain. Reject with a reason, edit photos as the applicant, and resubmit; then approve and verify the same account becomes a tailor. Race photo removal/submission and review actions in separate tabs to verify hosted concurrency.
5. Test legacy pending/approved applications with no photos: show **No evidence provided**, preserve approvals/roles, and allow the existing pending review. No backfill should create evidence.
6. Simulate failed/lost upload or attachment responses, reload to reconcile, and use cleanup after one hour. Confirm only that user's unreferenced files are removed through Storage, with attached photos protected.
7. Publish a complete shop without cover or portfolio, confirm its initials and equal directory visibility, add/remove a cover, and verify removal does not unpublish. Confirm private evidence never appears on public pages or in `tailor-public`.
8. Recheck auth, role guards, password recovery, admin applications, public/private navigation, existing published shops, and mobile layouts.

No live changes or deployment were performed. Hosted Storage authorization/expiry, actual uploads, and browser concurrency remain live checks.
