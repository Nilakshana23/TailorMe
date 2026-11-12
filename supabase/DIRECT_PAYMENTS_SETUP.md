# Direct bank-transfer and cash payment records

New migration: **`20261030002500_direct_payments.sql`**. No applied migrations were edited. No live SQL, bucket operation, bank transaction or deployment was performed.

Money moves directly between the customer and tailor outside TailorMe. This feature records customer reports and the tailor's confirmation/rejection. It has no gateway, cards, automatic bank verification/transfers, platform-held funds, escrow, refunds or commission collection. “Receipt confirmed by tailor” is a manual assertion by the addressed tailor.

## Exact migration order

Inspect hosted migration history and apply only missing migrations, in this order through the normal reviewed process:

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
22. `20261030002200_private_chat_images.sql`
23. `20261030002300_chat_upload_authorization_metadata.sql`
24. `20261030002400_design_change_proposals.sql`
25. `20261030002500_direct_payments.sql`

The payment-enabled frontend requires 025 first. Keep existing pg_cron prerequisites for 008; payments add no scheduled jobs or Realtime publication. Do not rerun 022/023 to configure receipts.

## Eligibility, exact amounts and history

Payment recording requires an accepted request with an immutable `request_quote_agreements` row in LKR. Its agreed total is authoritative; no client total is accepted. Customers can report multiple partial payments. Text amounts use 1–12 digits, optionally 1–2 decimal places, must be positive and cannot exceed the currently outstanding confirmed balance. Money is stored/calculated using PostgreSQL NUMERIC and crosses the API as decimal text. The browser never sums money using JavaScript floating-point arithmetic. Payment dates are actual dates from 1900 through today in Asia/Colombo.

`request_payments` submissions are immutable. A separate immutable `request_payment_decisions` row records confirmation or rejection, reason, server-derived actor and timestamp. The joined `payment_details` view reports version 1/pending or version 2/decided. Pending/rejected submissions never count as received. Correcting a rejection requires a new submission and new receipt; the old report and receipt stay in history. Confirmed reports cannot be edited/reversed in this step.

`request_payment_state` checks participant identity and returns the immutable agreed total, confirmed sum, pending sum, remaining balance, eligible bank destination and full history from a consistent database snapshot. Pending reports may overlap and sum above the balance; they are not reservations of funds or confirmed receipts. Each confirmation locks the request, checks the expected payment version and sums confirmed payments again. A competing confirmation that would exceed the total is rejected, never silently clipped. `payment_revision` writes the locked request row on submission/decision, so snapshot-isolation transactions also encounter write conflicts. It does not change the existing request workflow version, price, confirmed date, design or progress.

Reports require customer identity; only the addressed user with the tailor role can decide. Confirmation requires `p_confirm_received=true`; the UI asks the tailor to check their bank account for bank transfers or actual cash receipt for cash. Rejection requires 1–2,000 trimmed characters. Exact submission/decision retries return the original result without duplicates; conflicting payloads/decisions require refresh. Notifications for report/confirmation/rejection are atomic and deduplicated by payment ID/kind, with only the other participant notified. Notification failure rolls back the report/receipt attachment or decision.

Payments are independent of completion: an accepted request with an accepted quotation remains eligible after work is completed, so outstanding amounts can still be recorded/verified. Payments neither block nor trigger work completion. Requests with no quotation/payment history remain valid and show an eligibility/empty state rather than invented amounts.

## Private bank details

The tailor manages bank details in their private shop-profile portal, under **Bank details for direct transfers**. This form uses a separate private `tailor_bank_accounts` table, not public shop fields. Only account holder, bank, branch and account number are accepted; unsupported keys are rejected. Holder/bank/branch are trimmed text of 1–150 characters; account numbers are text of 3–40 digits, preserving leading zeros. No password, PIN or card information is requested. Optimistic bank versions protect concurrent edits and exact save retries.

RLS permits the owner and customers with an accepted request/quotation addressed to that tailor to view current details. Other customers, unrelated tailors, anonymous users and unrelated admins cannot read them. Bank transfers freeze the reviewed bank version and server-derived destination fields in the immutable submission. If the tailor changes their account after customer review but before report submission, the server rejects the stale version and requires a new review. Changes after submission do not rewrite the destination, including after confirmation/rejection. Current and historical destinations are clearly distinguished in request details. Full bank details are never logged or included in notifications/public shop pages.

## Receipt bucket and upload contract

025 creates a separate **PRIVATE `request-payment-receipts`** bucket:

- `public = false`; `file_size_limit = 5242880` (5 MB).
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Server-derived paths: `<customer UUID>/receipts/<request UUID>/<payment draft UUID>/<receipt UUID>.(jpg|png|webp|pdf)`.
- One reserved receipt per payment draft. Only the eligible request customer can reserve/upload/manage drafts; the tailor sees the file only once attached to a submitted report.
- Upload RLS validates both preliminary `contentLength` and final `size`, with supported extension/MIME and a positive length no greater than 5 MB. A supplied actual `size` takes precedence. Missing/invalid length is rejected. Readiness/reporting still require completed `size` metadata: a permission-probe-only row cannot be submitted.
- Request association, caller ownership, draft association, unused attachment state and actual Storage row existence are checked again inside the payment transaction.
- All object UPDATE operations are denied, including overwrites/upserts/moves. DELETE permits only caller-owned unreferenced files. Once submitted, receipts remain protected while pending, rejected or confirmed.
- Restrictive guards protect the bucket even if an older permissive Storage policy is broad. Older repository guards leave this bucket unchanged.

The bucket insert intentionally fails if a bucket with that ID already exists: inspect/reconcile its settings rather than silently accepting an unknown public configuration. No service-role key belongs in the frontend.

The existing authenticated XHR transport is reused with `POST`, actual File content type and `x-upsert:false`; no credentials/file contents are logged. JPEG/PNG/WebP signatures and the PDF `%PDF-` header are checked in the browser. Server validation covers Storage metadata and bucket MIME/size constraints, not a full PDF/image decoder or malware scanner. Real Storage HTTP behavior must be verified below.

Upload retries keep the receipt UUID and File. A lost upload response is reconciled by checking completed metadata before another upload; errors keep the original slot for retry/removal. A failed reconciliation cannot mask the original sanitized Storage error. Cleanup lists only the caller's unreferenced uploads older than one hour, excluding the active payment draft. Every removal uses authenticated **Storage API**, checks absence, then releases the reservation; production SQL never deletes managed Storage objects. Cleanup never includes submitted receipts, including rejected ones. Abandoned drafts can be cleaned from a fresh payment draft after the grace period.

Signed receipt URLs last 120 seconds, renew after 90 seconds and exist only in component memory. Images have inline previews; PDFs use an explicit private new-tab link with `noopener noreferrer` and no referrer. There is no PDF iframe or HTML rendering. Signed URLs remain bearer links until expiry. Only object paths are stored.

Bank-transfer reports have a dedicated review step showing amount/date/reference, destination and receipt before submission. Cash also has review, without a receipt/destination. An ambiguous send freezes the reviewed fields and stable payment ID; a definite database rollback allows editing/review again. Tailor confirmation is a separate unchecked-by-default actual-funds control. Styling-preview photos have no integration and are never uploaded automatically.

Selecting Bank transfer displays the addressed tailor's current account holder, bank, branch and full text account number directly in the form, with an accessible Copy control and clipboard success/failure feedback. Copy preserves leading zeros; review/history continue to display their frozen destination rather than substituting current details. If missing, the UI says “The tailor has not added bank details yet” and disables transfer review/submission while allowing cash. A request-scoped quotation-change event refreshes payment eligibility immediately after successful quotation acceptance, in addition to focus/manual/interval refresh. This UI wiring does not change RLS or migration 025.

## Local verification

From `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

On 2026-10-30, all **184 tests passed**, production build passed with the existing bundle-size warning, and lint passed. The targeted database/payment run also passed after the final bank-whitespace, wrong-draft receipt and broad-policy checks.

New `supabase/tests/direct_payments.sql` covers eligibility and legacy requests; customer/tailor/stranger/admin/anonymous authorization; bank field validation and leading zeros; exact partial amounts (20.10 + 30.20, etc.); zero/negative/non-finite/exponent/extra-decimal/over-balance rejection; pending/rejected exclusion; both serialized competing-confirmation winner orders; explicit confirmation and rejection reasons; immutable destination and stale bank review; private PDF limits and preliminary/final metadata; receipt association/cleanup/overwrite protection in all states; rollback on notification failure; idempotent reports/decisions; and unchanged request/design/date/workflow fields.

`tests/payments.test.mjs` covers exact decimal transport with no client totals/bank snapshot injection, PDF/image signature/size validation, stable upload IDs and lost responses, short URL TTL, caller-only API cleanup, no styling/public-bank integration, and real UI handlers for review/cancel, frozen retries, bank destination review, manual receipt confirmation and reason-required rejection. Existing quotation, progress, design, chat, snapshot and ownership suites also pass.

Local SQL uses PGlite Auth/Storage **metadata fixtures**. The competing-confirmation tests run both serialized orders; they are not independent concurrent hosted connections. UI handler tests are not rendered-browser inspection. No bank transaction was performed or verified by these tests.

## Remaining browser/live checks

1. Inspect hosted migration history and the PRIVATE receipt bucket/settings/policies before any reviewed migration application. Verify real customer, addressed/unrelated tailor, other customer, unrelated admin and anonymous JWTs against direct tables/views, state/mutation RPCs, bank reads and Storage reserve/upload/sign/list/download/delete/update/upsert/move calls. No public shop or directory may expose bank/receipt/payment data.
2. Verify actual JPEG/PNG/WebP/PDF uploads, MIME and extension mismatch, empty/oversized files, 5 MB boundary, expected preflight/final metadata, nonexistent files, wrong owner/request/draft and a second receipt. Probe metadata must not satisfy report readiness. Test sign renewal/expiry and expired/failed PDF/image delivery without logging URLs or contents.
3. Use independent connections/tabs to race two submissions, repeated same-ID reports, Confirm vs Confirm on competing amounts, Confirm vs Reject, bank edits vs reviewed submission, and cleanup/upload vs attachment. Exactly one decision per payment and no over-confirmation must result. Test the project's actual transaction isolation and safe retry after serialization/deadlock failures.
4. Lose upload/report/decision responses and reconnect/reload both roles. Check no duplicate money, notifications or attachments; pending/rejected never count as received; rejected submissions can be corrected using new IDs. Inject report/decision notification failure and verify atomic rollback. Preserve submitted receipts through stale cleanup attempts and all decision states.
5. Inspect desktop/mobile bank editing, entered leading zeros, review/back, failed uploads/removal, explicit bank-account/cash confirmation, rejection reasons, history/destinations, signed previews/PDF links, keyboard focus and account switching/logout. Check loading, empty, error/retry and saving states. Browser rendering was not available during implementation and remains unfinished.
6. Verify unchanged accepted quotations, confirmed deadlines, agreed designs, chat, notifications and progress/completion. An outstanding/pending payment must not auto-complete or block work. Completed accepted requests should retain eligible payment recording and private history. The UI refreshes payment state on focus, an explicit button and every 15 seconds while visible; no separate payment Realtime delivery is claimed.

These are required staging/live checks, not claims of completed verification. Do not use this implementation task to move funds, apply live SQL or deploy.
