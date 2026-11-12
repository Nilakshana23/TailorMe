# Design-change proposals

New migration: **`20261030002400_design_change_proposals.sql`**. No applied migration was edited, and no live SQL, bucket changes or deployment was performed.

## Exact migration order

Apply only missing migrations, through the normal reviewed migration process:

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

The new frontend requires 024. Keep 008's existing pg_cron setup. Do not blindly rerun 022/023: inspect hosted migration history first. [Upload diagnostics](CHAT_UPLOAD_DEBUG.md) explain the Storage authorization metadata contract.

## Workflow and immutable history

Only the addressed user with the tailor role can propose on an accepted, incomplete request. A proposal requires a trimmed 1–2,000 character explanation and 1–3 distinct private uploaded references, each JPEG/PNG/WebP and at most 5 MB. The server derives paths from existing upload reservations and validates owner, request, draft/proposal UUID, file existence, completed size/MIME and unused attachment state. Unknown structured attachment objects or client-supplied paths are rejected; clients send only IDs.

The existing PRIVATE `request-chat-images` bucket and authenticated upload/preview/cleanup services are reused. A file has either `message_id` or `proposal_id`, never both. Submission freezes reference paths and explanation, marks files attached and creates the customer notification atomically. Files remain immutable and protected from caller cleanup even after decline/withdrawal. No new public bucket or upload API was added. The 023 pre-upload `contentLength` validation and final `size` checks remain intact.

Ordinary chat messages never create proposals or change agreed versions. Already-sent chat files cannot become a proposal's attachments, and submitted proposal files cannot be consumed as a chat message. Styling-preview photos remain local and have no automatic upload path. There is no AI or paid service.

Only one pending proposal is allowed per request, with both a unique partial index and request-row locking. The customer alone can accept or decline; the tailor alone can withdraw. The UI requires a separate **Confirm accept design change** action after review; the RPC requires `p_confirm=true`. A repeated Review click cannot accept. Acceptance inserts a new immutable `request_agreed_designs` version, records decision actor/time and notifies the tailor in the same transaction. Decline/withdraw leave the current agreed version intact. Submission and decisions use expected versions, exact ID/payload retries and deduplicated notification keys. Conflicting decisions return a refresh error rather than reversing the first decision.

Version 0 is captured on the first proposal from the existing immutable request-design snapshot; its `original_snapshot` may be null for a request with no original design. Existing requests need no backfill and render their original snapshot until a change is accepted. Accepted versions 1, 2, … contain reference images/explanations, explicitly **not editable garment geometry**. The original request-design snapshot, drawings, collars and linked sketch references are never rewritten. Both participants see the latest agreement, the original and previous agreed versions, and complete proposed/accepted/declined/withdrawn history with timestamps. Version 0's capture time is not presented as a newly invented customer acceptance time.

Price, agreed quotations, preferred/confirmed dates, request workflow version and progress are not changed. A separate `tailoring_requests.design_change_revision` increments for proposal submission/decision only. This writes the same locked request row as completion, producing write conflicts under snapshot isolation as well as serializing normal request RPCs. The completion trigger blocks every transition from incomplete to completed while a proposal is pending, including old completion RPC routes; resolve the proposal first. Other progress stages remain available. After completion, history remains readable and new proposals/decisions are blocked, except exact retries returning previously recorded results.

## UI, privacy and notifications

Request details replace the old design-only section with the current agreement and pending proposal side by side on desktop, stacked on mobile. They reuse the original design renderer, private image previews/enlargement, accessible buttons and upload progress/error/removal controls. Failed uploads block submission until retried or removed. Ambiguous proposal and decision retries keep their original UUID, references and versions; only an explicit database rejection permits editing again. Refresh/reconciliation recovers confirmed submissions and conflicting decisions.

Proposal history refreshes on focus, through an explicit refresh button, and every 15 seconds in visible tabs. This is polling, not a new Realtime proposal subscription. Existing chat Realtime stays unchanged. Timers are cleaned up on navigation/logout; request details are keyed by authenticated user/request. Signed URLs last 120 seconds, renew at 90 seconds and remain only in component memory. Proposal image previews are labeled design references. The existing in-app notification bell supports proposed/accepted/declined/withdrawn events and links to the design-proposal section. No self-alerts, duplicate retry alerts, email, push or WhatsApp delivery is claimed.

Proposal and agreed-version tables expose SELECT only under participant RLS, with no direct client inserts/edits/deletes. Mutations are authenticated security-definer RPCs with fixed search paths and server-derived actor/timestamps. Storage keeps all restrictive bucket guards and no-update policy. Draft references are owner-only until submitted. Signed URLs remain bearer links until expiration. Privileged project operators/service-role keys bypass RLS; never expose them in the frontend.

## Verification and limitations

Local checks from `tailorme`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

Results on 2026-10-30: all **180 tests passed**, production build passed with the existing bundle-size warning, and lint passed. The final targeted chat-image/proposal component and transport run also passed all six tests after the reference-label adjustment.

SQL suite `supabase/tests/design_proposals.sql` covers customer/tailor/stranger/admin authorization, direct table and Storage protection, malformed/missing/duplicate/excess attachments, request/design version conflicts, only one pending proposal, submission/acceptance rollback on injected notification failure, immutable originals/measurements/quotations/dates, actual completion RPC blocking, successive agreed versions, no-original requests, exact retries, notification deduplication and terminal history. Acceptance-first/withdrawal-first tests exercise both serialized winner orders and reject the losing transition. These are local PGlite Auth/Storage metadata fixtures; they do **not** constitute independent concurrent hosted connections or actual Storage HTTP tests.

Browser handler tests exercise the actual proposal component and transport: separate acceptance confirmation and cancel, repeated review, frozen decision/submission retries, required reference images, role-specific controls, latest/original/history rendering, completion read-only state and participant gating. Existing chat, image upload, snapshots, measurements, quoting and progress suites also run. Browser rendering is not available in this environment; visual inspection is unfinished.

Remaining authorized staging/live checks:

- Inspect migration history and bucket/policy definitions; apply missing prerequisites in order. Verify real JWT access to proposal/agreed-version tables, RPCs and private Storage for the customer, addressed/unrelated tailors, unrelated customers, admin and anonymous users. Draft files must remain owner-only; all submitted proposal histories must remain participant-only.
- Upload real JPEG/PNG/WebP files, 1/3-image and 5 MB boundaries. Reject unsupported MIME, oversized/missing files, copied foreign IDs, wrong request/draft IDs and sent chat files. Test reference signing/expiry/renewal, no public URLs, no overwrite/upsert, and cleanup after all decision states. Storage validates metadata/HTTP constraints; no server image-decoding claim is made.
- Use **independent concurrent connections** to race two proposal submissions, Accept vs Withdraw in both orders, Accept vs Decline, two Accept calls, proposal submission vs completion, and cleanup/upload vs submission. Exactly one pending proposal/decision/version/notification should win; serialization/deadlock losers must safely retry their original IDs. Repeat at the project's actual transaction isolation settings. No request may complete while a proposal remains pending.
- Lose submission/decision responses, reload both participants, retry after later progress/completion, and inject notification or agreed-version insert failure. Verify atomic rollback/recovery, exact ordered images and unchanged agreed quotation/date, no extra design versions and no duplicate alerts.
- In desktop/mobile browsers verify comparison layout, enlarged reference focus/Escape/Close behavior, input focus, upload failures/removal, ambiguous retries, Accept confirmation and cancel, decline/withdraw, original and multiple accepted versions, and pending completion explanation. Check latest history after focus/refresh, logout/account switching and read-only history after completion. Confirm browser-only styling-preview photos never upload automatically.

No live SQL or deployment was performed as part of this task.
