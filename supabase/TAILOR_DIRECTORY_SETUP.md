# Tailor profiles, portfolios, and public directory

**Updated rules:** apply migration 004 after 003, following [PRIVATE_WORK_PHOTOS_SETUP.md](./PRIVATE_WORK_PHOTOS_SETUP.md). Public cover/portfolio photos are now optional; removing a cover no longer unpublishes. The original cover-required instructions/checks below describe migration 003 only. Private application evidence uses its own private bucket and is never copied here.

## Live Supabase setup — not executed by the agent

The existing application workflow is working live. Its applied migrations are unchanged. This task adds one new migration:

`supabase/migrations/20261026000300_tailor_profiles_directory.sql`

1. Confirm you are in the Supabase project configured by the app. The foundation and application migrations (`20261026000100` and `20261026000200`) must already be applied. **Do not rerun or replace them.**
2. In **SQL Editor → New query**, as `postgres`, paste the ENTIRE new migration and click **Run**. It creates the two shop tables, scoped RPCs, RLS policies, and a dedicated `tailor-public` Storage bucket. The migration is transactional and intended to run once. If a table, policy, or bucket with these names already exists, stop and reconcile it rather than dropping user data. Do not make an existing private bucket public to work around a naming conflict.
3. In **Storage → tailor-public → Configuration**, verify **Public = on**, **maximum file size = 5,242,880 bytes (5 MiB)**, and allowed MIME types exactly **image/jpeg, image/png, image/webp**. No SVG or wildcard image MIME types. Verify the project's global Storage file-size ceiling is at least 5 MiB; leave other buckets' limits and policies unchanged.
4. Verify the new Storage policies exist on `storage.objects`: own-path INSERT, own metadata SELECT, and own unreferenced-file DELETE. There is no shop-bucket UPDATE policy. Restrictive guards prevent older broad permissive policies from allowing writes/deletes/metadata listing outside these rules in this bucket. Public file serving bypasses SELECT RLS by design. This follows [Supabase public-bucket behavior](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [bucket limit configuration](https://supabase.com/docs/guides/storage/uploads/file-limits).
5. Reload the frontend. As a tailor with an approved application, open **Shop Profile** at `/tailor/profile`. Its first initialization copies the approved application's business fields into an unpublished profile. Verify the copied address/phone are the ones you want to disclose publicly; edit them before publishing. Reopening the editor never overwrites existing shop edits. The application remains an unchanged review record.

No live database, bucket, policy, account, or file was changed by this task. No new environment values or service-role key are required. SQL Editor migrations do not automatically reconcile CLI migration history; do that before a future CLI push.

## Public data and images

Profiles expose only the public business projection: public shop UUID (`owner_id`), shop name, description, specialties, city, public business address, business phone, years of experience, availability, publication flag, and cover path. Portfolio public fields are image ID, shop UUID, image path, and caption. Column grants exclude server versions/timestamps. No Auth emails, account profiles, applications, reviewer details, or rejection reasons are included. Existing application/account policies are unchanged.

Unpublished shops cannot be read through directory/table queries. The editor uses an owner-scoped initializer RPC to obtain its unpublished row/version. Owners can read their own portfolio while editing. Other readers can see portfolio records only while the shop is published and its owner still has both the trusted database tailor role and an approved application. Revoking the role immediately hides directory results; metadata cannot substitute for that role.

**All files uploaded to `tailor-public` are public by URL, even before publishing and after unpublishing.** Publishing controls database listings, not image secrecy. Do not upload customer reference images, body photos, identity documents, private addresses in image captions, or any other private data. This bucket is solely for public shop/portfolio images. Browser and CDN copies may persist after file deletion; unpublishing is not a privacy-revocation mechanism.

Publishing requires complete business fields, integer experience between 0 and 80, a valid business phone, and a saved cover image. Availability is independent of publication. Removing a cover automatically unpublishes the shop until a new cover is attached and the tailor explicitly publishes again. No order requests, ratings, reviews, pricing, or sales metrics are created.

## File ownership and failure recovery

- Names are unique UUIDs under `<auth-user-uuid>/cover/<random-uuid>.jpg|png|webp` or `<auth-user-uuid>/portfolio/<random-uuid>.jpg|png|webp`. The filename extension is chosen from validated MIME type rather than the user's filename. SVG, empty/oversized files, and mismatched JPEG/PNG/WebP signatures are rejected by the client. Bucket MIME/size limits also apply at the Storage API, including direct API uploads that bypass the UI.
- Uploads use the existing client's current session and the Storage object endpoint with XHR byte progress. Passwords and tokens are not logged or manually persisted. Storage objects cannot be overwritten via the shop policies. A maximum of 20 attached portfolio images is enforced in the database. Captions are at most 300 characters and rendered as text.
- Upload then attach: the database checks the file exists in the owner's correct folder. If upload/attachment fails, the client attempts cleanup of only the generated owner-scoped path. If an attachment committed but its response was lost, Storage DELETE policies keep the referenced file protected. Reload to reconcile the actual saved state before retrying.
- Replacement/removal: commit the new cover/reference or delete the portfolio row first, then remove the old file through Storage. If cleanup fails, the updated record remains valid and the UI reports the cleanup problem. It does not roll back the new image to a missing old file.
- **Clean Unused Uploads** scans only the signed-in approved tailor's matching paths, excludes all attached files, and returns at most 100 candidates older than one hour. This covers interrupted tabs/crashes without depending on browser local storage. Repeat cleanup if more than 100 orphans exist. Recent files are intentionally excluded to avoid other in-flight uploads. Cleanup does not target other users, other buckets, or private references.
- Attachment and delete checks acquire a matching transaction advisory lock, and references are rechecked before deletion. Profile versions reject stale edits/covers. Storage and PostgreSQL cannot form one distributed transaction; lost HTTP responses and hosted concurrency still need live verification. Never delete Storage metadata directly with SQL: use the Storage API or dashboard. The SQL migration adds policies, not custom triggers on managed Storage tables.
- If a tailor loses their role or their account is deleted, their mutations/cleanup stop; an owner must inspect and remove any remaining public files via the Storage dashboard/API. No background service-key cleanup or deployment is included.

## Automated checks run locally

From `tailorme`, run:

```text
npm test
npm run build
npm run lint
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. The test runner applies all three migrations to ephemeral PGlite PostgreSQL with minimal Auth/Storage schema fixtures. It runs:

- `supabase/tests/portal_authorization.sql`
- `supabase/tests/tailor_applications.sql`
- `supabase/tests/tailor_profiles_storage.sql`

The NEW shop/Storage suite is **local-fixture only**: do not paste it into a hosted project's SQL Editor, because it deliberately inserts/deletes mock Storage metadata inside a rollback transaction. It tests SQL privileges and policies, not the hosted blob service or its MIME/size enforcement. The prior two suites retain their application-specific setup instructions. Component checks render the actual React components with test auth/role contexts; image-workflow tests inject upload/cleanup transports and never contact Supabase.

Coverage includes approved-application prefill/idempotence, preservation of review records, owner isolation, public column projection, draft/published visibility, denied unauthorized writes, complete-field and cover requirements, stale versions, protected referenced files, cross-owner attach/delete denial, orphan cleanup, broad-policy guards, role revocation, image validation, compensation after database failure, progress-capable upload orchestration, public warnings, filters, navigation, and honest card details. These checks do not claim a browser interaction test or live Storage upload.

## Remaining live verification

Use two approved tailor test accounts plus a customer and an incognito visitor. Do not share their credentials or tokens.

1. Tailor A opens `/tailor/profile`: verify prefill, edit/save/reload, unchanged approved application, unpublished default, and explicit publish failure without a cover/complete fields. An admin/customer or a manually role-assigned tailor lacking an approved application must not manage a shop.
2. Upload real JPEG, PNG, and WebP images up to the limit. Verify byte progress, saved cover, caption edits, portfolio removals, maximum 20 images, and automatic unpublication when removing the cover. Try SVG, zero-byte, mismatched-type, and >5 MiB files; also use the Storage client directly to confirm the bucket rejects MIME/size violations independent of browser validation.
3. Tailor B attempts to upload to A's path, overwrite A's object, attach A's file, caption/delete A's portfolio record, and remove A's file using the authenticated API. All must be denied or delete zero objects. Customer/anonymous uploads and all direct profile table writes must fail. Metadata/account-email changes must not grant access.
4. Attempt direct deletion of A's referenced cover/portfolio files with A's Storage client: the files must remain. Detach through the editor, then verify API cleanup succeeds. Do not test by SQL-deleting Storage metadata.
5. Interrupt an upload or make attachment fail (for example stale profile version/offline response). Verify reload shows the true saved state, referenced files remain, and unreferenced files older than one hour can be cleaned without touching B's files. Exercise competing cover edits/cleanup in two tabs against the hosted Storage service.
6. Publish A, then open `/tailors` anonymously and as a customer. Verify the real card, case-insensitive name/city/specialty filters, escaped `%`/`_` searches, pagination, empty/error/retry, image fallback, availability, detail portfolio, business contacts, and back-link filters. B's unpublished profile must not appear or be readable by its UUID. Unpublish A and verify both listing and detail disappear to other users.
7. As owner in a test project, revoke a published tailor's role and verify listing visibility and mutation denial immediately. Restore only the intended test role afterward. No automatic admin/role assignment was added.
8. Check mobile layout/navigation, keyboard focus, welcome links, role dashboards, applications/admin decisions, Google/email login, logout, and password recovery. Verify there are no invented reviews, prices, ratings, or order counts.

No deployment or live SQL execution was performed.
