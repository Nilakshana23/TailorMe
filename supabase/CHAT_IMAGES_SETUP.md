# Private request-chat image messages

New migration: **`20261030002200_private_chat_images.sql`**. Apply it after migrations 001–021, in the [exact prerequisite order documented here](REQUEST_REFERENCES_SETUP.md#private-request-references). In particular, 020 provides chat/notifications/Realtime authorization and 021 provides the shared `valid_reference_file` validator. Existing migration files were not edited. Migration 021 remains necessary even if request-creation reference uploads are not used. Do not deploy the new frontend before 022 has been applied through the normal migration process.

**Upload correction:** 022's preliminary Storage metadata mismatch is corrected separately by **`20261030002300_chat_upload_authorization_metadata.sql`**, after 022. See [upload diagnostics and read-only live checks](CHAT_UPLOAD_DEBUG.md). The current frontend requires 023 for the documented Storage authorization contract; do not modify or rerun 022 to fix it.

No live SQL, hosted bucket changes or deployment were performed for this implementation.

## Bucket setup

022 creates **`request-chat-images`**, separate from both `request-reference-images` and `tailor-public`:

- PRIVATE (`public = false`), maximum 5,242,880 bytes per file.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Server-derived paths: `<sender UUID>/chat/<request UUID>/<draft message UUID>/<upload UUID>.(jpg|png|webp)`.
- Authenticated uploads require an owned reservation for that exact request/message and an open conversation. Both customer and addressed tailor can reserve/upload.
- Owners can read drafts; only the request participants can read sent images. The other participant cannot inspect unsent drafts. Unrelated customers, tailors, admins and anonymous clients receive no additional access.
- UPDATE is denied, including overwrite/upsert and move into/out of the bucket. DELETE requires caller ownership and an unreferenced upload. Sent files remain protected after cancellation, rejection or completion.
- Restrictive guards prevent older permissive Storage policies from exposing the bucket.

Do not manually create a public bucket or use service-role credentials in the browser. The bucket insert intentionally fails if the same bucket already exists; review any pre-existing settings/policies before migration rather than silently retaining unknown access rules.

Storage metadata must provide positive `size` no larger than 5,242,880 and `mimetype` matching the extension. Storage HTTP bucket limits and database checks validate declared MIME/size; the shared browser validator additionally checks file signatures. This is not a server image decoder or malware scanner. Actual service metadata and HTTP behavior require the checks below.

## Message and retry behavior

Messages permit text up to 2,000 Unicode code points after trimming, or one to three images with an optional caption. Whitespace-only text without images remains invalid. `request_messages.images` defaults to `[]`, preserving legacy messages. Ordered entries contain upload IDs and object paths, never signed URLs.

`reserve_chat_image` limits each sender/draft to three slots, checks request membership and pending/accepted-incomplete state, and derives the object path. The browser generates the message UUID before reserving uploads. An image keeps the same upload UUID and File across retries; confirmed metadata recovers a lost upload response without uploading twice. Failed/partial uploads block sending until retried or explicitly removed. The UI shows which ready images will be sent and keeps all selected images/caption during an ambiguous send.

`send_request_image_message` locks the request, validates ordered distinct IDs, owner, request, draft/message association, actual Storage rows, matching MIME and size, and writable state. It inserts the immutable message with paths, marks uploads attached, and creates the existing one-recipient notification in the same transaction. Injected notification failure rolls back all three. No design, measurements, quotation, deadline or work-stage data is changed. An exact retry returns the existing message even after the request ends; changed captions, attachment order/IDs, sender or request are rejected. Existing `send_request_message` delegates to the same server logic with no images, preserving legacy clients and preventing text-only retries from stripping images.

The existing request-message table remains the Realtime source: the INSERT already contains the full immutable caption and attachments. No separate attachment event or publication is needed. Existing participant RLS, sequence pagination, unread/read position, notification deduplication and reconnect draining apply to image-only messages too. Reconnection reconciles by message ID/sequence. No automatic scrolling was added. The composer resets only after delivery is confirmed; a late send response cannot clear a newer attachment draft already started after Realtime confirmation.

Previews use signed URLs lasting 120 seconds, renewed at 90 seconds, held only in component memory. Received images open in a native modal dialog with an accessible label, close control, Escape behavior and browser focus handling. Visual/keyboard verification remains necessary. Signed URLs are bearer links until expiry.

The explicit cleanup control lists only caller-owned, unreferenced uploads older than one hour and excludes the current draft. Removal uses the authenticated Storage API, confirms file absence, then releases its reservation. The database never deletes managed Storage objects. Path locks coordinate cleanup with attachment; stale cleanup lists cannot delete files that have become attached. Abandoned/lost-response drafts can be cleaned from another fresh chat draft after the grace period. Failed removal retains the local selection. A failed upload is not automatically deleted.

Browser-only styling-preview photos are not integrated with this upload path. Nothing uploads until the participant chooses a file using Attach image. No AI/paid API, public sharing or design-change proposal workflow was added. Request-creation references remain a separate feature.

## Local verification

Run from `tailorme`:

```text
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

On 2026-10-30: **176 tests passed**, build passed (existing Vite bundle-size warning), lint passed. An additional targeted database run passed after adding explicit rejection/completion upload checks.

New tests in `tests/chat-images.test.mjs` and `supabase/tests/chat_images.sql`, plus expanded `tests/request-messages.test.mjs`, cover:

- Caller/participant/request/draft ownership, private drafts, direct table/Storage restrictions, private bucket and three-slot limits, unsupported inputs, missing files, zero/oversized files, MIME mismatch and captions.
- Both customer and tailor sending, image-only messages, ordered immutable attachments, exact retries, changed-payload rejection, old text messages and read-only terminal states.
- Atomic rollback on notification failure, one notification/unread per message, no changes to the request agreement, protected sent files, caller-only aged cleanup and active-draft exclusion.
- Browser upload signature/size validation, partial failure/lost-response reconciliation, short URL expiry, API-only cleanup, real composer removal/retry handlers and enlarged dialog controls.
- Existing pagination/reconnect tests, image-only reconciliation after an ambiguous response, stable attachment payloads, no duplicate render and no forced scrolling.

PGlite uses local Auth/Storage metadata fixtures, not real JWT verification, actual blobs, independent concurrent PostgreSQL connections or hosted Realtime delivery. UI handler tests are not rendered-browser inspection.

## Remaining browser and live checks

In an authorized non-production project after reviewed migration application:

1. Confirm the private bucket settings and Storage metadata contract. Upload actual JPEG/PNG/WebP images at the 5 MB boundary; reject oversized/empty/unsupported MIME, mismatched extensions and forged paths. Verify actual HTTP behavior for invalid file contents; no server decoding claim is made.
2. Use actual customer, addressed tailor, unrelated users/admin and anonymous JWTs against reserve/send RPCs, direct tables and Storage list/sign/download/upload/delete/update/upsert/move endpoints. Verify the recipient cannot access draft images, public URLs fail and participants retain sent history after terminal states.
3. Confirm `request_messages`, `request_message_reads` and `tailoring_requests` remain in `supabase_realtime`, as configured by 020. Test two browsers, offline/reconnect, more than 100 missed rows, older pages, one unread/alert per image-only message and no self-alerts. Confirm attachment paths appear atomically with the message, never as a later patch.
4. Race reservation, upload, send and cleanup using independent connections/tabs. Check the three-slot/message limit, stale cleanup protection, safe transaction retries after lock/deadlock errors and rollback on notification failure. Lose upload/send responses; retry must not duplicate files, messages or alerts. Files referenced by sent messages must never disappear through caller cleanup.
5. Inspect desktop/mobile: visible Attach image control for both roles, progress, three-image selection/removal, optional caption/image-only send, failures, frozen retry previews, and terminal read-only history. Verify keyboard focus, dialog focus trapping/restoration, Escape/Close, image refresh after expiry, and continued enlarged viewing during URL renewal.
6. Switch accounts/logout during upload and navigation; subscriptions and signed-preview timers must be cleaned up and another user's drafts/history must not appear. Verify styling-preview photos remain browser-only and cannot enter chat without explicit file selection. Verify existing designs, measurements, references, quotations and dates remain unchanged.

No email, phone push or WhatsApp delivery is claimed. Design-change proposals are a separate workflow provided by [migration 024](DESIGN_PROPOSALS_SETUP.md); ordinary chat images never change the agreed design.
