# Private request references

**Corrective upload migration:** apply `20261030002600_reference_upload_authorization_metadata.sql` only after existing prerequisites 001–025. It corrects preliminary `contentLength` authorization for this bucket using 023's validator; final readiness and snapshot attachment still require completed `size`. Do not edit or rerun applied 021. See the [MVP review](../MVP_REVIEW.md#corrective-migration-order) for evidence, order and outstanding live checks.

Migration 021 is local source only; it has not been applied to a hosted project. No deployment or live SQL was performed. Do not create a duplicate migration. Apply missing prerequisites in this exact order, through the normal reviewed migration process:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`
7. `20261027000700_confirmed_deadlines_notifications.sql`
8. `20261027000800_schedule_deadline_reminders.sql`
9. `20261027000900_request_quotations.sql`
10. `20261027001000_tailoring_progress.sql`
11. `20261027001100_customer_designs.sql`
12. `20261028001200_custom_necklines.sql`
13. `20261028001300_extended_garments.sql`
14. `20261028001400_design_drawings.sql`
15. `20261028001500_drawing_placement.sql`
16. `20261028001600_blank_sketches.sql`
17. `20261029001700_my_measurements.sql`
18. `20261029001800_template_refinement.sql`
19. `20261029001900_collar_styles.sql`
20. `20261029002000_request_messages.sql`
21. `20261029002100_private_request_references.sql`

Deploy the reference-enabled frontend only after 021. Existing migrations are preserved. Migration 008's existing pg_cron prerequisites remain applicable; this feature adds no scheduled jobs or Realtime publication changes.

## Bucket and authorization

021 creates `request-reference-images` with `public = false`, `file_size_limit = 5242880`, and allowed MIME types `image/jpeg`, `image/png`, `image/webp`. Do not use `tailor-public`, enable public access, or add service-role credentials to the frontend. The bucket insert deliberately fails if an independently created bucket already exists; inspect and reconcile that setup before running the migration, rather than silently accepting unknown policies.

Object paths are server-derived: `<customer UUID>/references/<draft batch UUID>/<upload UUID>.(jpg|png|webp)`. A customer reserves a slot before uploading. Reservations are serialized per customer and limited to five per batch; submission independently enforces five distinct attachments. Only the owner can inspect/manage drafts. Submitted paths and notes are readable only by the request's customer and addressed tailor, including direct table and Storage calls. Admin users receive no additional private access. Restrictive Storage guards also constrain permissive policies from earlier migrations.

Storage metadata must contain positive `size` (maximum 5242880) and `mimetype` matching the extension. The Storage HTTP bucket limits and RLS enforce declared format/size; client validation additionally checks magic bytes. This is not a server-side image decoder or malware scanner. Verify the actual project's Storage service populates this metadata before enabling the UI.

All UPDATE operations on this bucket are denied, preventing overwrite/upsert/move into or out of it. Submitted paths cannot be deleted by customers or tailors, regardless of request state. Privileged service-role/operator access bypasses RLS and must not be exposed to clients.

Private previews mint signed URLs valid for 120 seconds and refresh after 90 seconds. Only object paths are persisted; signed URLs live in component memory. Signed URLs are bearer links until expiry. See [Supabase access control](https://supabase.com/docs/guides/storage/security/access-control) and [private downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## Submission, retries and cleanup

Only explicitly chosen files are uploaded. Browser-only styling-preview photos have no reference-upload integration. No public publication, AI service or paid API is involved.

The editor shows ready images in attachment order, their optional notes (maximum 500 characters), and excluded failures before sending. Images are optional. Files with unconfirmed upload failures are excluded until retry confirms them. Retry reuses the reserved UUID and checks Storage metadata before uploading again, including after a lost upload response.

The composer freezes request fields, image IDs/order/notes, design version and measurement consent for an ambiguous submission. Its retry preview retains the exact images and notes. `send_tailoring_request_with_references` locks/resolves owned reservations, checks actual Storage rows and valid metadata, delegates to the existing design/measurement request transaction, then inserts immutable attachments. Failure rolls back the request, snapshots, design attachment lock and reservation submission flags together. Repeating the same request ID compares frozen attachments and existing request inputs; changed notes/order/IDs are rejected. A file cannot be reused for a different request. Requests without images retain the existing RPC path and remain valid.

The cleanup control lists only the caller's unsubmitted reservations older than one hour, excluding the active draft batch. Every deletion is separately authorized. It removes files through the authenticated Storage API, confirms absence, then releases the reservation. Submitted files are protected even if a stale cleanup list or another browser tab races submission. No production SQL deletes managed Storage objects. See [Storage deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects). A cleanup interruption can be retried; an ambiguous upload never triggers automatic deletion.

Request details display frozen references for both participants alongside existing design snapshots, measurement snapshots and chat. Request-creation references do **not** implement chat image messages or design-change proposals. Those are separate features: [private image messages](CHAT_IMAGES_SETUP.md) and [design-change proposals in migration 024](DESIGN_PROPOSALS_SETUP.md).

## Verification and remaining checks

Local checks: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint` from `tailorme`. The database harness applies all migrations in order to PGlite with minimal Auth/Storage fixtures, then runs existing workflow suites and `supabase/tests/request_references.sql`. Tests cover ownership/participants, private bucket settings, file limits/metadata, reservation limits, unsupported inputs, ordered notes, idempotency, immutable files/attachments, unused cleanup exclusions, and injected attachment failure rolling back design/measurement/request changes. Browser service tests cover magic-byte/size validation, upload response loss/retry, short-lived URLs, Storage API cleanup and exact request payloads with no-image compatibility.

Results on 2026-10-30: all 172 tests passed, production build passed (Vite reports a bundle-size warning), and lint passed. The real editor-handler test additionally verifies failed uploads remain excluded, retry keeps the upload ID, notes/order survive adding another image, and failed removals retain the selection.

These local tests do not exercise real Storage blobs, Auth JWTs, HTTP signed URL delivery, or independent concurrent PostgreSQL connections. Browser visual verification is unfinished; the available browser environment previously had no accessible browser and URL policy blocked access. Remaining checks in an authorized non-production project:

- Confirm private bucket settings and actual Storage metadata. Upload real JPEG/PNG/WebP files at the 5 MB boundary; reject empty, oversized, unsupported MIME/extension and forged owner paths. Check actual HTTP service behavior for mismatched file contents; the implementation makes no server image-decoding claim.
- Test customer A/B, addressed/unrelated tailors and anonymous JWTs against tables and Storage list/download/sign endpoints. Guessed paths and public download URLs must fail. Verify signed URL expiry and refresh without persisting URLs or logging contents.
- Verify no more than five reservations per batch under concurrent calls; verify missing files, duplicate IDs, cross-owner/batch IDs and notes over 500 characters are rejected.
- Race upload, removal, cleanup and attachment using independent connections. Confirm failed/deadlocked transactions are safely retryable, submitted files remain present, and overwrite/upsert/move/delete attempts fail before and after request completion/cancellation.
- Lose upload/submission responses deliberately; retry without duplicate files, requests, notifications or snapshots. Inject attachment failure and confirm no request/design/measurement/reference partial commit. Verify existing quotation, deadlines, work stages and chat still work.
- At desktop/mobile widths test explicit file picker, entered notes/order, previews/expiry, upload progress, removal failure, failed-image exclusion, submit without images, frozen retry preview, participant details, keyboard focus and account switching. Verify styling-preview photos stay local unless separately selected using the reference file picker.
- Exercise cleanup across browser tabs; only caller-owned aged unsubmitted uploads may be removed, active-batch uploads are excluded, and submitted references remain immutable.

No live SQL, bucket operations or deployment are authorized by this implementation task.
