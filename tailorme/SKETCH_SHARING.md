# Customer design reference: tailor selection and sharing

Sketches are labeled **Customer design reference** in the designer, saved-design
cards, directory selection preview, request preview and request details. They
are visual instructions for discussion with a tailor; construction, measurements
and feasibility require tailor review. They are not presented as sewing patterns.

Save the active sketch, then choose **Find a tailor for this design**. The saved
ID travels in the `design` query parameter through directory filtering, clear
filters, pagination, shop links, shop/back navigation and sign-in return URLs.
The directory shows the selected sketch reference. A missing/inaccessible design
shows an error and cannot be silently submitted as an unlinked request.

The request form's **Tailor will see this design** section uses the shared
renderer with the complete 320 x 480 sketch, fills, colours, outlines, layer order,
title, category and notes. It does not use the drawing editor's current zoom or
pan. A category pre-fills the request garment type. With no category, the customer
enters a garment type for the existing request workflow; no template is inferred.

Submission sends only the saved design ID/version alongside ordinary request
fields. The server verifies the signed-in customer, locks their saved design,
checks its version and category where applicable, creates the request and copies
the complete saved sketch into an immutable snapshot in the same transaction.
Retrying the same submission does not duplicate the request/snapshot. Attached
designs remain read-only; even a trusted later source mutation cannot alter an
earlier snapshot. Request details read the snapshot, never the source design.

The same SVG renderer paints directory/saved thumbnails, pre-submission review,
and participant request details. Full-canvas viewBox/preserveAspectRatio settings
keep annotations and shapes within the complete canvas visible at thumbnail and
detail sizes. Old template designs and historical snapshots keep their original
rendering and clipping semantics. Comparisons of saved artwork ignore JSON object
key ordering, while preserving the significance of item and point array order.

## Server and privacy audit

- Migration 011 establishes owner-only reads for source designs, SELECT-only
  participant access to request snapshots, customer-only mutation/submission RPCs,
  row/version checks and immutable attached-design behavior.
- Migrations 012-016 extend validated geometry, garment fields, drawing data and
  snapshot copies. Migration 016 already supports both categorized and
  uncategorized sketch requests, including title, notes, colours, fills and layers.
- Migration 015 accepts per-stroke drawing placement while preserving legacy
  clipped strokes. Migration 016 supersedes the validator for artwork v2 but does
  **not** remove migration 015 from the required migration history.
- Stroke/shape schemas accept bounded numeric coordinates, explicit kinds,
  widths, validated colour values and fills. Arbitrary SVG/HTML/CSS, URLs and
  unknown artwork keys are rejected. Plain-text titles/notes render through
  React escaping, never as HTML.
- Personal photos, filenames, photo alignment, measurements, local preview
  shapes and canvas view/background settings are excluded from save and request
  payloads. The server also rejects unknown photo/alignment fields.

**No new migration is required for this continuation. No existing migration was
edited, and no live SQL or deployment was performed.** Live migration status is
unknown: do not assume 015, 016 or any other file has been applied.

## Exact execution order

First compare the target project's migration ledger with these local files.
Apply **only pending migrations**, in the order below, through the normal
Supabase migration workflow. Do not rerun applied migrations, rename historical
files or apply 016 alone while skipping a pending 015. This list documents the
order; it is not evidence that any migration has run live.

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

Deploy/release the corresponding client only after an authorized migration and
verification process. No such release is part of this change.

## Local checks

From `tailorme`: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`.

The PGlite suite applies all 16 migrations in order, including 015, against local
Auth/Storage fixtures, runs each historical suite, and then runs
`supabase/tests/sketch_sharing.sql` against the final schema. Coverage includes:

- Drawing, shape, fill and colour validation, invalid geometry/payload rejection,
  custom necklines and legacy clipping/template/snapshot preservation.
- Categorized/uncategorized sketch save/reopen, stale-version rejection, atomic
  snapshot copying, submission retries and no duplicate snapshots.
- Owner access, foreign-customer mutation/submission denial, addressed-tailor
  snapshot access, unrelated customer/tailor/admin isolation, anonymous denial,
  authenticated snapshot-write denial and source-edit isolation.
- Real client filter/pagination/clear handlers, shop/back and sign-in URLs,
  complete request preview, saved ID/version-only transport, shared thumbnail and
  participant-detail rendering, and JSON-key-order-safe saved comparisons.

No hosted project is contacted. Database fixtures are rolled back. Native UI
layout/pointer behavior is not simulated by the handler/SSR tests. PGlite's Auth,
Storage and scheduler fixtures do not replace hosted Supabase verification.

## Remaining authorized staging/live and browser checks

1. Audit the actual migration ledger, especially 015. Apply only pending files in
   the exact order above in an authorized staging environment. Verify PostgREST
   exposes the new fields and current RPC definitions; refresh schema metadata
   using project procedures if necessary. Check live RLS/grants as customer,
   addressed tailor, unrelated users and anonymous client.
2. Create/save/reload a reference with filled rectangle/ellipse, custom HEX colours,
   an open outline, changed layer order, notes and edge-to-edge annotations.
   Repeat with and without a category. Confirm the saved thumbnail is complete
   and labeled Customer design reference.
3. Use Find a tailor, filters, clear filters, pagination, shop links, browser back
   and sign-in return navigation. Verify the same selected reference ID remains.
   Confirm inaccessible/deleted selections cannot be submitted silently.
4. Inspect Tailor will see this design at desktop and mobile widths, after editor
   zoom/pan and browser resizing. Confirm all shapes, fills, colours, title and
   notes are visible; the sketch is not replaced with a template.
5. Submit using staging test accounts, retry the same submission and verify one
   immutable snapshot. Reopen request details as customer and addressed tailor;
   compare the same complete reference. Verify unrelated accounts cannot read
   it. Use staging fixtures only for a trusted source-edit isolation demonstration.
6. Open historical template/drawing requests and verify unchanged rendering and
   permissions. Regression-check native mouse/touch drawing, fill/colour editing,
   zoom/pan, selection and the unsaved-draft navigation warnings.
7. Inspect save/submission network payloads: there must be no photo, filename,
   alignment, measurement, preview shape or canvas view/background data. Personal
   photos must remain local browser blobs with existing cleanup behavior.
