# TailorMe MVP review — 2026-10-30

This was a repository/code review plus local automated regression testing. It was **not a live end-to-end browser test or a production security certification**. No live records were read/changed, no money moved, no live SQL was applied and nothing was deployed. No new product features were added.

## 1. Issues found and fixed

| Issue evidenced in source/tests | Fix | Main files |
| --- | --- | --- |
| A delayed initial `getSession` failure could overwrite a newer valid auth event with an error, blocking a signed-in user. | Ignore stale initial-session results/errors after the SDK has delivered a newer auth state. Logout remains authoritative. | `tailorme/src/auth/AuthProvider.tsx` |
| Portal role/profile result keys included the access token. Every token renewal caused a loading state, unmounting active editors/chat/forms and losing drafts. | Key visibility by user ID/explicit retry; still re-query role/profile on token renewal in the background. Account switches immediately mask old profile/role. Access failures still fail closed. | `tailorme/src/auth/PortalProvider.tsx` |
| Request-creation references still required completed `metadata.size` during the preliminary upload authorization probe. Chat's 023 correction did not fix references. | New corrective **026** uses the existing bounded preliminary/final image validator. Final readiness/snapshot attachment still require actual `size`. Owner/customer/reservation/count/deletion/immutability guards remain. Tests reproduce rejection under 021 and success after 026. | `supabase/migrations/20261030002600_reference_upload_authorization_metadata.sql` |
| Customer dashboard claimed zero active orders and disconnected tracking; tailor/admin dashboards rendered fake zero totals despite working requests, conversations and payments. | Remove placeholder metrics and obsolete disconnected-workflow claims. Link to existing request/notification/application flows without inventing totals or adding analytics. | `tailorme/src/pages/Dashboards.tsx` |
| Accepted quotation UI always said “no payment recorded”, even after payments existed. | Display the immutable agreed quote total and direct users to the existing payment ledger for receipt confirmations/balance. | `tailorme/src/components/portal/RequestQuotations.tsx` |
| Shared business-form inputs inherited the login-only underline appearance/focus treatment. | Scope full borders, background, padding and dark keyboard focus/error borders to portal inputs. Auth screen styling remains unchanged. | `tailorme/src/pages/Applications.css` |
| Chat's broad direct-child DIV rule overrode the responsive image grid with flex layout. | Restrict the metadata-row rule to the header DIV; image grids retain their grid layout. Rendered mobile verification remains outstanding. | `tailorme/src/components/portal/RequestMessages.css` |
| Chat send failures discarded the actual server/network error, and a successful background metadata refresh immediately cleared the failure. | Separate refresh errors from send errors; retain the actual send message until explicit retry/refresh or confirmed delivery. Original text/images/submission ID and safe retry reconciliation stay intact. No content logging was added. | `tailorme/src/components/portal/RequestMessages.tsx` |

No existing migration 001–025 was modified. The only database change is additive corrective migration 026. No ownership/participant policies were removed, broadened or replaced with blanket allows. The upload authorization helper accepts validated `contentLength` during the probe; it does not allow arbitrary/missing metadata or grant another user's upload access.

## 2. Checks actually performed

Commands run from `tailorme`:

```text
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Full local regression result: **186 tests passed**. Production build and lint passed; Vite still reports the existing large-bundle warning. Targeted auth, request-reference database and chat-send regression tests were also exercised while fixing the issues.

Test changes include `tests/auth-lifecycle.test.mjs`, updated dashboard expectations and chat error assertions, `supabase/tests/reference_upload_metadata.sql`, and an old-phase reproduction in `request_references.sql`. The database harness applies every migration in filename order and runs each associated workflow suite using local PGlite Auth/Storage fixtures.

| MVP area reviewed | Actual source/local test evidence | Not verified live |
| --- | --- | --- |
| Auth, role guards, navigation | Route/guard/provider inspection; safe return destinations, recovery/role routing, auth-event race and token-renewal/account-switch tests; trusted DB role fixtures. | Real Google/email callbacks, email delivery, refresh-token/session behavior across real browsers, hosted redirect allowlist. |
| Applications, private evidence/certificates, approval | Application workspace/save/retry coordination, review controls and server transition inspection; local applicant/admin/outsider access, attachment, PDF/MIME/size, approval/rejection/version suites. | Actual upload/download/signing, browser file pickers/previews and admin onboarding in the hosted project. |
| Shop publication/discovery | Publication/availability controls and public projection inspected; directory filters/pagination and public-vs-private file boundaries exercised locally. | Real published/unpublished visibility and Storage URLs. Public shop portfolio files are intentionally public; application evidence/certificates are separate private buckets. |
| Designer/sketches/refinement/collars/saved designs | Existing geometry, undo/redo, structured artwork, custom neckline/collar compatibility, template refinement, save/reopen and snapshot suites passed. Styling-preview transport boundary tests passed. | Canvas/touch interactions, actual pixel layout, GPU/browser rendering, navigation/unsaved prompts in browser. |
| Measurements and request snapshots | Stable cm/inch conversions, partial values, ownership, consent, atomic immutable measurement/design/reference snapshots, legacy requests and retries passed. Corrected reference preflight contract tested separately. | Real JWT/Storage behavior and consent UI with actual accounts. |
| Requests, quotations and proposals | Request roles, status transitions, accepted immutable LKR agreement, proposal confirmation/withdrawal/history/versioning, pending completion block, no-original designs and rollback suites passed. | Independent concurrent connections, user-to-user update timing and actual notification links in browser. |
| Text/image chat | Participant/terminal rules, text/image validation, pagination, unread/read position, same-ID retries, missed-page reconciliation, subscription cleanup and no forced-scroll tests passed. | Hosted Realtime publication/RLS delivery, real reconnect/drop behavior, signed image renewal and native modal focus. |
| Progress, deadlines, reminders/completion | Eligibility/stage transitions and ownership inspected; Colombo date boundaries, deduplication, date history, reminder generation and completion/proposal blocking suites passed. | Real pg_cron extension/job execution, project timezone/configuration, real reminder arrival/mark-read. The harness mocks the cron contract; it runs no scheduler. |
| Direct payments/bank/receipts/balances | Accepted-agreement eligibility, exact NUMERIC sums/text transport, partial payments, pending/rejected exclusion, explicit manual confirmation, both serialized confirmation winner orders, immutable bank destinations/history, receipt metadata/cleanup and retry suites passed. Copy/leading-zero and accepted-quote refresh handlers passed. | Actual Storage blobs/JWTs, independent simultaneous confirmations, actual bank receipt verification and rendered receipt/PDF controls. No actual money movement/verification was attempted. |

These are component/transport tests and local SQL contract tests, **not simulated checks presented as live checks**. PGlite substitutes minimal Auth/Storage tables and a cron contract; it does not run Supabase Auth, Storage HTTP/blob delivery, hosted Realtime or independent PostgreSQL sessions. All fixture data are local test data and rolled back.

No browser/Windows automation runtime is available among this session's tools. Desktop/mobile rendering and keyboard behavior therefore remain **unverified**. No browser-policy restriction was bypassed using an alternate automation method.

## Corrective migration order

026 requires all existing prerequisites, including the 023 metadata validator. The complete 001–025 filenames/order are in [direct payment setup](supabase/DIRECT_PAYMENTS_SETUP.md#exact-migration-order). The tail of the sequence is:

1. `20261029002100_private_request_references.sql`
2. `20261030002200_private_chat_images.sql`
3. `20261030002300_chat_upload_authorization_metadata.sql`
4. `20261030002400_design_change_proposals.sql`
5. `20261030002500_direct_payments.sql`
6. **`20261030002600_reference_upload_authorization_metadata.sql`**

Inspect hosted migration history and apply only missing migrations via the normal reviewed process. Do not edit/rerun applied 021 or 023 to fix references. 026 creates no bucket and preserves the existing PRIVATE `request-reference-images` bucket: JPEG/PNG/WebP, 5 MB, up to five reserved references per draft. Its final file/snapshot checks remain strict. 026 has not been applied by this review.

## 3. Remaining live/manual checks

Use an isolated staging project and owned test accounts/fixtures before a pilot:

- **Auth/roles:** signup/confirmation, email+Google sign-in, forgot/recovery, safe redirect return, refresh while unsaved sketch/chat/payment drafts are open, logout/account switching, approval → tailor navigation, and customer/tailor/admin deep-link denial. Provision admin access through the trusted existing procedure, never client signup metadata.
- **Application/shop journey:** submit with/without evidence/certificates, failure/resume, admin review with attachments, reject/resubmit, approve, save/publish/unpublish shop, filter/page directory, send a request and confirm no private application/account/bank data appears in public projections. Verify intentionally public portfolio-file behavior separately from private evidence.
- **Real Storage:** all private buckets must be PRIVATE with expected MIME/5 MB limits. Use real JWTs to test owner/participant/admin/outsider/anon access and actual file existence, preflight/final metadata, guessed/public URLs, signing/expiry/renewal, overwrite/upsert/move/delete protection and API-only caller cleanup. In particular verify corrected request-reference uploads after 026. Existing diagnostic SQL: [chat upload checks](supabase/checks/chat_upload_diagnostics.sql).
- **User request journey:** saved garment/sketch → measured profile → explicit measurement consent and exact references → retry response loss → request snapshots → tailor accepts inquiry → quote sent/accepted → proposal accepted/declined/withdrawn → latest agreement/history → chat text/images/unread → progress/deadline → completion. Check that changing/deleting profiles or designs cannot rewrite snapshots, and styling-preview photos never upload automatically.
- **Independent concurrent sessions:** same-ID request/message/payment retries, proposal Accept vs Withdraw/Decline, competing payment confirmations, proposal creation vs completion, bank edit vs frozen review, and cleanup/upload vs attachment. Exercise real isolation/serialization/deadlock outcomes. Local tests only cover serialized winner orders, not real parallel connections.
- **Realtime/reminders:** confirm publication contains request messages/read positions/requests and participant RLS applies. Test offline/reconnect with missed pages and one alert per incoming event. Confirm pg_cron is enabled and the named 5-minute deadline job exists once, runs successfully, respects Asia/Colombo dates and stops/invalidate reminders after date change/completion.
- **Financial UI:** account numbers retain leading zeros, customer sees only the addressed tailor's eligible details, clipboard failure is recoverable, bank review is frozen/versioned, private PDF/image receipts remain protected after rejection, pending never counts as paid, explicit account/cash confirmation is required, and balances agree across both participants. No payment should change work, quote, deadline or design state. Technical QA must not move funds or assert bank verification.
- **Visual/keyboard at 320/375/768/1280+ widths:** portal menus and focus/skip links; application inputs/uploads/review; long shop/request names; directory filters; designer/collar/anchor controls; measurement units/errors; request toolbar/cards/details; image grids/modal Escape/focus restoration; proposal comparison/confirmation; payment/bank forms and PDF links. Check entered values, validation, loading, empty, saving and retry states. All are still unverified in a rendered browser.

Feature-specific setup/live checklists remain in `supabase/REQUEST_REFERENCES_SETUP.md`, `CHAT_IMAGES_SETUP.md`, `DESIGN_PROPOSALS_SETUP.md`, `DIRECT_PAYMENTS_SETUP.md`, and the existing application/deadline/designer documentation.

## 4. Gates before a small real-user pilot

**The MVP is not live-verified or pilot-cleared by this review.** Resolve these gates first:

1. Verify the intended project's migration history and reviewed prerequisites through **026**, bucket definitions, Auth callback configuration, trusted role assignments, Realtime publication and real cron operation. This session could not inspect them.
2. Complete a two-user customer/tailor journey plus admin application approval in an isolated staging environment, with real Auth/Storage APIs and the negative-access checks above. A passing fixture harness is insufficient proof of deployed privacy/ownership behavior.
3. Run independent-connection races for agreement/payment/attachment/completion paths; confirm no duplicate submissions, over-confirmed balances or lost immutable files.
4. Perform desktop/mobile/keyboard checks, particularly canvas controls, image layout/modals, full-border portal inputs, long values, confirmation/retry controls and bank/PDF views.
5. Confirm a real pilot operator can handle approval, manual receipt verification, rejected/corrected submissions and private upload cleanup using the existing tools. Receipt confirmation is the tailor's responsibility; no automatic reconciliation or reversal tool is supplied.

Known non-blocking scope limits: aggregate revenue/user analytics and manual user-role management are not implemented; dashboards now avoid presenting placeholder totals. The production JS bundle still triggers Vite's size advisory, so test perceived performance on a representative mobile connection. These were not expanded into new features during this review.
