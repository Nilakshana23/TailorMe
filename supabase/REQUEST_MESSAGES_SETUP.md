# Text-only request messages

This document describes the migration 020 baseline. The current image-message extension requires migrations 021 and [022: private chat images](CHAT_IMAGES_SETUP.md), which preserve this text-chat workflow. Use that setup document for the current frontend prerequisites.

No live SQL was applied and nothing was deployed.

## Exact migration order

Verify hosted migration history first; apply only missing migrations. Never edit or rerun applied migrations. Release the frontend only after 020 succeeds.

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

020 depends on request participant RLS (006), notifications (007/009/010), and the preceding schema chain through 019. It adds immutable request_messages and owner-only request_message_reads, narrowly granted RPCs and recipient-only message notifications.

## Sending and history

Only the request customer and addressed tailor can read/send, including through the REST API and Realtime. Admins and other customers/tailors have no override. A request-row lock serializes message sequence assignment with cancellation/acceptance/rejection/completion. New messages are allowed only for pending or accepted incomplete requests. Ended requests retain read-only history.

The UUID comes from the client; sender ID, timestamp and per-request integer sequence come from SQL. The server trims browser-compatible Unicode boundary whitespace and validates 1-2000 Unicode code points. Internal newlines remain. HTML-like strings are literal React text, never HTML. Unknown RPC parameters have no matching function; there is no attachment, edit or delete endpoint and no direct table write grant.

An exact retry returns the same row, including after a request has ended. A reused ID with changed request/sender/body is rejected. Message/notification insertion is one transaction. Messaging does not update any request column, quotation, measurement, design snapshot, deadline or progress record.

## Pagination, reads and recovery

Initial and older pages use sequence-descending keysets (30 visible rows plus one lookahead), then render chronologically. Reconnect fetches sequence > highest reconciled cursor, in ascending 100-row batches until caught up. UUID merging prevents duplicates across send replies, subscription events, polling and reconnect. First-page/subscription races queue another reconciliation. Commit ordering follows the per-request lock, so lower uncommitted sequences cannot be skipped. Older loaded pages are retained.

Read position is a monotonic per-participant sequence, not a timestamp. Summaries count incoming messages after that participant's cursor. Older/stale tabs cannot move it backwards. The UI calls the read RPC only with a rendered latest-message cursor while the bottom sentinel is in the viewport and the document is visible. It rechecks DOM bounds to avoid marking a newly appended offscreen message before IntersectionObserver updates. Lack of IntersectionObserver conservatively leaves messages unread. Server RPCs authorize the participant and message cursor; a server cannot independently prove browser visibility.

No arrival forces scrolling. Jump to latest is explicit; prepending older pages preserves the scroll offset. Failed messages keep typed text and the frozen UUID/body for retry. A later authoritative read can resolve a lost send response. On navigation/logout, pending callbacks are ignored and channels, timers and observers are cleaned up. The request-list Open conversation link shows a batched unread summary; counts refresh on focus and every 30 seconds.

## Realtime setup

Use the existing authenticated Supabase browser client (publishable key plus user session). Never put a service-role key in the frontend. Postgres Changes checks SELECT/RLS access to each row; the request-ID channel filter is a performance scope, not authorization. Official documentation: https://supabase.com/docs/guides/realtime/postgres-changes

When the existing supabase_realtime publication is present, 020 adds only missing tables: public.request_messages, public.request_message_reads and public.tailoring_requests. It does not create or replace a publication. If the publication is absent, the migration leaves it alone; an authorized staging administrator must enable these tables in Supabase Database > Publications before testing live delivery. Do not publish a public view or weaken RLS to get updates working.

Subscribe only to INSERT for messages, own-RLS read-position changes, and participant request UPDATE events. Payloads trigger authorized database re-fetches; they are not appended directly as trusted message bodies. Every SUBSCRIBED/reconnect status reconciles missed rows. There are manual Refresh messages, online/focus refresh and visible-tab 30-second polling fallbacks. Live connection status is displayed without claiming delivery.

## In-app notifications

One message_received alert is created for the other participant, with a unique message_id. No self-alerts or client-created message alerts exist. Notification rows contain no body preview. Advancing the read cursor marks matching recipient alerts read. The bell's manual Mark as read affects that alert only, not conversation read position. Chat updates refresh the existing bell without duplicate toast alerts. Existing deadline-wide invalidation cannot invalidate chat alerts; previous notification kinds retain their rules. These are in-app notifications only, with no email, phone push or WhatsApp delivery.

## Local verification and remaining live checks

From tailorme run npm.cmd run build, npm.cmd run lint and npm.cmd test. Local PGlite tests cover direct API-equivalent RLS, participant/anonymous/admin denials, whitespace and length validation, pending/accepted/terminal states, exact retries after terminal changes, immutable rows, tied-timestamp keyset pagination, monotonic reads, recipient-only notifications and preservation of request fields. JavaScript tests exercise real transport filters, reconnect pagination/races/deduplication, failed-text retry, visibility-gated reads, scroll preservation and logout channel cleanup. The complete existing workflow suites also run.

Remaining checks requiring a separately authorized staging project/browser:

- Verify migration history, publication membership, hosted Realtime settings and PostgREST schema refresh.
- With real JWTs in separate customer/tailor/unrelated/admin/anonymous sessions, verify REST and WebSocket visibility boundaries, including guessed request filters and logout/token expiry.
- Exercise simultaneous sends, ID collisions, read updates and terminal transitions in distinct PostgreSQL transactions; PGlite tests sequential fixtures, not independent concurrent connections.
- Disconnect/reconnect beyond two pages, lose a successful send response, suspend/background tabs and verify no gaps, duplicate rows or alerts.
- Inspect desktop/mobile layouts, keyboard/screen reader controls, long Unicode text, older-page scroll position and read behavior with the conversation offscreen.
- Confirm quotations, design/reference/collar snapshots, optional measurements, dates and progress remain unchanged through hosted messaging.

No hosted Realtime transport or browser visual verification has been performed. Vite's bundle-size advisory remains. Message bodies and secrets are not logged by the implementation.

Local results: build and lint pass; the full suite passes all 167 tests. Final chat-specific handler/transport/reconnect checks also pass after the scroll-anchor refinement. PGlite is a schema/RLS/transaction fixture, not evidence of live WebSocket delivery.
