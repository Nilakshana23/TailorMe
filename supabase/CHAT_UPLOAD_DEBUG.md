# Chat image upload: HTTP 400 diagnostic and correction

## Evidence and scope

The hosted project's failed response and live configuration could not be inspected from this environment: there is no connected Supabase project or accessible authenticated browser session. **The actual reported HTTP 400's Storage code/message remains unverified.** Do not treat a generic 400 as proof of an RLS failure, missing bucket or MIME rejection.

A concrete defect was reproduced locally: migration 022's `chat_image_write_allowed` calls `valid_reference_file`, which requires `metadata.size`. Supabase's current [upload authorization source](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts) sends `metadata.mimetype` and `metadata.contentLength` to the pre-upload permission INSERT; its completed-object check uses actual object metadata. A valid reserved request-chat upload therefore fails the preliminary INSERT under 022 with PostgreSQL `42501` even though its owner, path, MIME and length are valid. The old tests used only completed `{size,mimetype}` metadata, so they missed that phase. Hosted Storage versions can differ; the next actual response and read-only checks below must confirm the live diagnosis.

Repository migrations 003, 004, 005 and 021 scope their restrictive guards to their own buckets and return true for the chat bucket. The local allowed-upload tests execute with those guards installed. **No conflicting older policy was found in repository source**; manually created or drifted live policies remain unverified. No policy was dropped or authorization disabled.

## Changes

New corrective migration: **`20261030002300_chat_upload_authorization_metadata.sql`**, after 001–022 in their existing order. Migration 022 was preserved; do not edit or blindly rerun it. Prerequisite order through 021 is in [reference setup](REQUEST_REFERENCES_SETUP.md); 022 is documented in [chat image setup](CHAT_IMAGES_SETUP.md).

023 changes only the chat upload metadata validator: preliminary `contentLength` is validated using the same positive integer, 5 MB, MIME/extension rules as completed `size`. If `size` exists, it takes precedence, so an invalid actual size cannot be disguised with a valid declared length. Missing, zero, negative, fractional, non-numeric and excessive lengths are denied. Null/no-metadata probes are deliberately **not** allowed; a different hosted Storage contract needs fresh evidence, not a blanket metadata bypass.

The owner/reservation/exact path/request participation/writable-state checks and path locking remain unchanged. `chat_image_ready` and sending still require actual completed `size` and MIME metadata. Probe-only rows cannot be attached. No changes to private bucket settings, read/delete rules, sent-file protection, count limits or no-update/upsert behavior were made. This correction is scoped to chat; it does not change the request-creation reference bucket's validator.

The shared XHR upload now parses only Storage's `code` (or legacy `error`/`statusCode`) and `message`, exposing them in the existing inline error UI with useful permission/bucket/type/size/retry guidance. The `StorageUploadError` carries safe diagnostic context: bucket, object path, authenticated user UUID, contentType, byte count and `upsert:false`. No logging was added. It never retains raw response bodies, headers, File data, session tokens or signed URLs. Known credentials and URL/token patterns are redacted from server error text; non-JSON/HTML responses stay generic.

Chat retry reconciliation still checks whether a lost-response upload actually finished. If that check also fails, it now preserves the original Storage error instead of masking it with the second error. Slot ID, file and message ID remain stable, with no automatic deletion or overwrite.

## Trace and required live steps

1. Run [read-only diagnostic SQL](checks/chat_upload_diagnostics.sql) manually in the intended project, replacing its zero UUID/file-type/size placeholders. It checks migration history, private bucket settings, every live Storage policy, validator definitions, reservation ownership/path, request participation/state and existing object metadata. These SELECTs do not perform an upload or validate a real JWT; admin SQL-editor access does not establish client RLS access. No SQL from this file was executed live during this task.
2. Retry the same failed image once the diagnostic frontend is available through the normal release process. Read the inline **actual** HTTP status, Storage code and message. Do not copy a complete network request/response, Authorization headers, signed preview URLs, image payload or secrets into logs/issues. A local debugger may inspect the safe `StorageUploadError.context` fields. This is deliberately not a production logging channel.
3. Confirm the trace: `reserve_chat_image` returned the same upload UUID, owner equals the current SDK session user UUID, request/draft IDs match, bucket is exactly `request-chat-images`, path is the returned server path, `Content-Type` equals the validated File MIME, body length is within 5 MB, request is pending/accepted incomplete, `POST` uses `x-upsert:false`. No client-supplied metadata override is used.
4. If the live definitions match 022 and the failure is its preliminary metadata check, review/apply **023 only** through the normal migration process. If the actual response instead identifies a missing bucket, missing migration, MIME/size error or unexpected restrictive policy, address that evidenced configuration issue; do not blindly rerun 022, remove guards or add a broad allow policy.
5. In a non-production project verify actual HTTP uploads for both participants with JPEG/PNG/WebP, boundary 5 MB files and safe response-loss retries. Check unrelated users, mismatched reservations/paths, terminal requests, invalid MIME/size and overwrite/upsert attempts remain denied. Confirm missing/probe-only objects cannot be sent and sent files cannot be deleted by cleanup. Verify that participant previews still use expiring signed URLs.

Bucket remains PRIVATE, allowed MIME types JPEG/PNG/WebP, max 5,242,880 bytes, max three images per message. Browser-only styling-preview photos remain separate.

## Local verification

`supabase/tests/chat_images.sql` now reproduces the rejected preliminary INSERT under 022. `chat_upload_metadata.sql`, run after 023, exercises allowed preliminary/completed INSERTs under all older guards, foreign owners, recipient upload to someone else's slot, absent reservations, invalid lengths/MIME, terminal requests, final-file checks, immutable sent files and exact retry.

`tests/storage-upload-errors.test.mjs` exercises actual XHR handling with mocked Storage responses, including raw HTTP 400 plus Storage `Unauthorized`/RLS message, credential/URL redaction, path/user/MIME/size tracing, `POST`, no-upsert and account-change rejection. These are fixture responses, **not** the user's captured live response. Chat tests also cover preservation of the original diagnostic if retry reconciliation fails.

No live SQL, deployment or hosted Storage operation was performed. Browser/live checks above remain outstanding.

Verification on 2026-10-30: full `npm.cmd test` passed all **178 tests**; `npm.cmd run build` passed with the existing bundle-size warning; `npm.cmd run lint` passed. Final targeted Storage-error/chat-upload/database tests were also run after the diagnostic formatting adjustment.
