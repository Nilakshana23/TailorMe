# Customer Dress Designer — migration 011

No live SQL, deployment, provider connection or storage changes were performed.

## Prerequisites and exact migration order

New file: **`supabase/migrations/20261027001100_customer_designs.sql`**.

Verify actual schema and migration history first. Apply the complete unchanged migration chain once in order, skipping only files confirmed already applied:

1. `20261026000100_portal_foundations.sql`
2. `20261026000200_tailor_applications.sql`
3. `20261026000300_tailor_profiles_directory.sql`
4. `20261026000400_private_evidence_optional_shop_photos.sql`
5. `20261027000500_optional_tailoring_qualifications.sql`
6. `20261027000600_tailoring_requests.sql`
7. `20261027000700_confirmed_deadlines_notifications.sql`
8. Enable Supabase Cron/pg_cron, then `20261027000800_schedule_deadline_reminders.sql`.
9. `20261027000900_request_quotations.sql` (PostgreSQL 15+ prerequisite).
10. `20261027001000_tailoring_progress.sql`.
11. `20261027001100_customer_designs.sql`.

Run one entire file per SQL Editor query as postgres in the intended project, confirming success before continuing. Existing files/data are preserved. Reconcile unexpected objects instead of dropping data. Reconcile manual SQL execution with CLI migration history before later pushes. No new environment variable, bucket, secret key, try-on provider or scheduled job is required. Existing Auth URL settings still apply to return navigation; the same validated returnTo mechanism now also allows the internal customer designer route.

## Supported designer and UI

The customer portal provides **Dress Designer** at `/customer/designer`, reopening at `/customer/designer/<design-id>`. The customer dashboard and portal navigation link to it. The split illustration/control layout follows the existing Stitch designer reference and design tokens; it stacks on mobile.

Supported garments: dress, blouse, skirt. Colours: ruby, navy, sage, ivory, black. Dress/blouse necklines: round, V-neck, square; sleeves: sleeveless, short, long. Lengths are short/midi/long for dresses and skirts, and cropped/hip/tunic for blouses. For skirts, neckline/sleeve controls are explicitly not applicable, stored as none; the server rejects combinations that pretend a skirt has these features.

The authored SVG silhouette changes immediately with supported options. Colour changes fill; neckline changes the actual opening; sleeve changes add the appropriate sleeve geometry; length changes the hem, and blouse/skirt/dress shapes differ. Every preview is labelled **Design illustration**, with an accessible descriptive SVG title and text details. It is not a photo, an AI-generated result, a body-fit/measurement prediction or a virtual try-on. No customer-photo input/storage, overlay, simulated generation, payments or chat is introduced. Virtual try-on requires a future actual provider and private-photo architecture.

Customers can privately save, reopen, edit and delete unattached designs. A stable UUID and expected version protect save retries and conflicting changes. Loading/retry, error, empty, save/delete success and gallery pagination states are provided. Local selections stay in memory until saved. Refreshing the saved-design library does not reset the current working selection.

## Ownership, validation and immutable request snapshots

`customer_designs` grants authenticated SELECT under owner-only RLS. Only current customers can use the scoped save/delete RPCs. Owner/version/attached metadata is derived server-side, not accepted as design input. Raw INSERT/UPDATE/DELETE is denied. Supported enums/combinations, field types, design-name limits and unknown options are validated by RPCs/table constraints. No raw SVG, arbitrary image URL, customer photo or CSS colour is stored; SVG is generated in code from validated options and a fixed palette.

**Find a tailor for this design** is enabled after saving the latest selection. It navigates to `/tailors?design=<uuid>`. The ID is carried through directory filters, Clear All, pagination, shop links, detail back navigation, directory header/mobile links and validated authentication returns. The selected design is loaded through its owner RLS; an invalid/inaccessible ID never silently falls back to a design-free request. If the design changes in another tab, submission rejects the stale version and asks the customer to reopen/reselect.

The request composer shows the selected illustration/details and uses its garment type. A stable request attempt retains both design ID and version on retry. `send_tailoring_request_with_design` derives the customer, locks their trusted role and source design, checks the expected design version/garment, then calls the existing request creation service inside the same transaction. It copies normalized design fields/name/version into `request_design_snapshots`. Request creation and snapshot attachment either both commit or both roll back. Normal requests without a design keep using the original RPC.

Only request participants can read the snapshot; the addressed tailor gains no access to the source design library. Snapshot records cannot be written/edited/deleted through browser roles. A retry must refer to the same source design/version and original request payload, creating one request and one snapshot. A source snapshot cannot be added to or swapped onto an already submitted design-free request. Raw ownership or snapshot-payload spoofing is denied.

Once attached, a source design is read-only and cannot be deleted. Its version/options remain available for reopening and can be reused for another inquiry if desired. Start a new design to make changes. The request snapshot is independently immutable: even a future trusted maintenance update to the source cannot change what the tailor received. Attached_at is set server-side; callers cannot clear it. Deletion and editing serialize against attachment, so a stale/deleted/foreign source cannot be attached.

Both customer/tailor request details show the same fixed illustration/customization details, or an honest no-design state for existing requests. Request acceptance, quotation/agreed totals, confirmed dates, stage tracking, completion and reminders are unchanged. No automatic quote/order/payment is created by a design.

## Local verification and required live checks

From `tailorme`, run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

Local PostgreSQL tests apply all eleven migrations with existing mock Auth/Storage and mock Cron registration. New tests cover owner isolation, other-customer/tailor/admin/anonymous denial, unsupported options/types, invalid skirt combinations, stale versions, create/update/delete retries, source locking after attachment, no raw mutations, atomic failed submissions, one immutable snapshot on retry, no design swap onto an old request, and snapshot stability after trusted source maintenance. They also run a design-bearing inquiry through acceptance, exact quotation/agreement, confirmed date, progress start and completion to verify integration. UI/service tests render all 285 supported combinations and check geometry changes, accessibility, palette, no photo/AI placeholder, preserved selection navigation/auth returns, and server-bound design/version payloads. These checks do not prove live HTTP/browser usability or actual simultaneous hosted transactions.

Before release, use a separate Supabase test project:

1. Apply the exact chain. Check existing accounts, requests, quotes, deadlines, stage history and notifications remain unchanged. Verify RLS and only SELECT/RPC browser grants on both new tables; no public policies.
2. As customer A create/save/reopen/edit/delete unattached dress, blouse and skirt designs. Try invalid enum/type/unknown-key payloads, malformed IDs, stale versions and direct writes. Customer B, unrelated tailor, admin and anonymous must not read/change A's private designs, even using known UUIDs.
3. With the designer open, exercise every control on desktop/mobile and with keyboard/screen reader. Verify SVG neckline/sleeve/hem changes and labels. Skirt options must be explicitly inapplicable. No photo input, try-on generation or fit claim should appear.
4. Save, choose Find a tailor, filter/paginate/clear filters, open shops/back/header links, and sign out/in if needed. Confirm the selected design stays associated with browsing and that invalid/foreign design IDs block attachment rather than silently dropping it.
5. Submit to an approved published accepting tailor. Confirm exactly one request plus snapshot, participant-only details/illustration and no source-library access for the tailor. Unpublish afterward and verify participant snapshot access remains. Requests without a design must still work.
6. Lose the create/save/request response and retry the same IDs/versions. Expect no duplicate designs/requests/snapshots. Race editing/deleting the source against request submission in separate sessions: either the valid locked version is snapshotted or the stale/missing design is rejected, with no request lacking its intended snapshot. Try swapping a design on retry or attaching to an existing design-free request; both must fail.
7. Attached sources must be read-only/nondeletable. Verify snapshot customization values remain unchanged if a trusted test-only source update occurs. Never use fixture SQL or manipulate real users' source records for this check in production.
8. Walk the design-bearing request through accept/reject/cancel where applicable, quotation acceptance, dates, stage tracking and completion. Confirm original version checks, agreed charges and reminder-stop behavior still apply. No payment, photo upload, chat, AI try-on or automatic order is created.

Recorded local result: all **104 tests passed**; build and lint passed. The existing Vite >500 kB bundle warning remains. Live SQL, actual multi-session races, manual browser/device checks and deployment remain unexecuted.
