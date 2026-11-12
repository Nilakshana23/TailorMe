# My Measurements

No live SQL has been applied and nothing has been deployed.

Apply migrations in this exact order. For an existing project, verify its migration history and apply only missing migrations; never rerun or edit an applied migration. The new migration is 017 and requires 001-016. Apply 017 before releasing the frontend that calls its RPC.

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

## Data and consent

One owner-keyed personal profile stores optional numeric fields in canonical centimetres to 0.01 cm. Display-unit switches never write converted values back to the profile. Inches use exactly 2.54 cm per inch. Bounds are product input limits, not medical or fit recommendations:

| Field | Type | Inclusive cm bounds |
| --- | --- | --- |
| Shoulder | Width | 10-100 |
| Bust/chest | Circumference | 30-300 |
| Waist | Circumference | 20-300 |
| Hip | Circumference | 30-300 |
| Sleeve | Length | 1-120 |
| Upper arm | Circumference | 5-100 |
| Top | Length | 10-200 |
| Dress | Length | 20-250 |
| Trouser | Length | 10-180 |
| Inseam | Length | 5-140 |

Measured-on dates must be from 1900-01-01 through today in Asia/Colombo. Empty profiles are allowed but cannot be shared. Null, nonnumeric, unsupported, out-of-bounds and overprecision values are rejected by SQL.

The unchecked sharing checkbox authorizes only the listed values and measured-on date. The server compares the submitted values to the owner's current saved profile before initial submission. Changed profiles require reloading and reviewing consent. A single RPC transaction invokes existing request/design functions, then inserts a participant-only snapshot with server consent time and snapshot version 1. A snapshot failure rolls back the request, design attachment and transaction-triggered notifications. No measurement values are placed in notifications or analytics.

Ambiguous retries retain the same request UUID, design version, consent and measurement payload. Existing snapshots are checked before the current profile, so edits/deletion do not prevent exact retries or rewrite historical values. Changing consent or values for an existing UUID is rejected. Original no-measurement request RPCs remain valid for legacy callers. Tables deny direct profile insert/update and all snapshot writes to authenticated/anonymous callers. RLS restricts profile select/delete to the owner and snapshot select to the request customer/addressed tailor (admins have no participant override). No photos are accepted or inferred.

## Local verification

From tailorme: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`. The test harness applies every migration to isolated PGlite with local Auth/Storage/cron fixtures, then runs SQL ownership, consent, unsupported-key, precision, combined design, forced snapshot-failure rollback, retry-after-edit/delete and legacy compatibility checks. UI handler tests cover unit toggles, partial saves, invalid input, failed-save retry and deletion. Existing quotation, progress, deadline, notification and design suites remain in the full run.

## Remaining live checks (not performed)

Local result: build and lint pass; all 151 tests pass. Vite reports a bundle-size advisory for the main application chunk. No hosted database, real JWT, browser accessibility audit or concurrent network-session check was used for these results.

- On a separately authorized staging project, verify migration history and PostgREST schema refresh, then exercise the new RPC with actual customer/tailor JWTs; confirm owner, unrelated customer, unrelated tailor, admin and anonymous API access boundaries.
- Exercise concurrent duplicate submission and concurrent profile edit/delete against PostgreSQL; confirm one request and one snapshot with unchanged server consent time. PGlite verifies sequential retries and rollback, not separate simultaneous network sessions.
- Verify keyboard/screen-reader and narrow/mobile layouts, including navigation wrapping, each help/error association, empty/loading states and failed network retries.
- Simulate a lost response after commit and retry with/without a design and with consent on/off; confirm notifications are not duplicated and quotations/progress/deadlines still behave normally.
- Verify old request details show no shared measurements, and owner profile edits/deletion leave participant snapshots unchanged. Confirm public directory/shop payloads and notification payloads contain no measurement data.
