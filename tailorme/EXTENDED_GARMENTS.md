# Extended Dress Designer garments

The shared `DesignIllustration` renders dresses, blouses, skirts, shirts,
trousers, kurtis and salwar tops in the designer, saved designs, photo preview,
request confirmation and participant snapshot views. Existing format 1/2 SVG
geometry remains on its original rendering branch.

| Garment | Options | Custom neckline | Local shape editor | Photo alignment |
| --- | --- | --- | --- | --- |
| Shirt | Point/band/no collar, short/long sleeves, length, colour | With no collar | Shoulders, underarms, sleeves, waist, hem | Shoulder/waist pairs, hem centre |
| Trousers | Flat/elastic waistband, straight/tapered/wide legs, length, colour | Unavailable | Unavailable; use leg options | Waist/hip pairs, separate outer leg hems |
| Kurti | Neckline, sleeves, length, none/short/long side slits, colour | Supported | Upper-body/sleeve/waist/hem tools | Shoulder/waist/hip pairs, hem centre |
| Salwar top | Neckline, sleeves, length, none/short/long side slits, colour | Supported | Upper-body/sleeve/waist/hem tools | Shoulder/waist/hip pairs, hem centre |

Shirts have collar geometry, a placket and a rounded shirt hem. Trousers have
a closed two-leg silhouette with a crotch cutout, distinct leg widths and visible
flat/elastic waistbands. Kurtis have a long straight hem and flared silhouette;
salwar tops have a different width, length and rounded hem. Side slits are
actual bounded cutouts in the filled silhouette. Slit tips stay inside the side
contour, including short lengths and local shape adjustments.

Switching garment types keeps name/colour and resets neckline, custom geometry,
sleeves, length and garment-specific options to compatible defaults, with status
feedback. Switching to a shirt collar resets custom geometry and uses the
standard collar opening. The no-collar option exposes neckline presets/editor.
Saved requests still receive the locked final design, not local photo or shape
adjustments. Photos, alignment, measurements and shape history remain browser
memory only.

## Schema and migration order

One additive migration is required:
`supabase/migrations/20261028001300_extended_garments.sql`.
No earlier migration is changed. Apply through the normal migration workflow,
in timestamp order, only in an authorized environment:

1. All earlier migrations through `20261027001100_customer_designs.sql`.
2. `20261028001200_custom_necklines.sql`.
3. `20261028001300_extended_garments.sql`.
4. Release the matching client after the new schema/RPCs are available.

No live SQL or deployment was performed for this change.

The new migration adds `garment_options jsonb not null default '{}'` to designs
and immutable request snapshots. New garment types require `format_version=3`:

```json
{"garment_type":"shirt","garment_options":{"collar":"point"}}
{"garment_type":"trousers","garment_options":{"waist_style":"elastic","leg_style":"wide"}}
{"garment_type":"kurti","garment_options":{"side_slits":"long"}}
{"garment_type":"salwar_top","garment_options":{"side_slits":"short"}}
```

These examples show only the new fields; normal design fields are still required.
Format 1/2 records keep their original values and receive empty options. Format
3 also permits legacy garments with empty options. Custom neckline geometry is
supported in formats 2/3 with the same five-depth numeric schema and size limits.

Server RPC and table constraints validate garment-specific enum combinations,
required option keys, irrelevant/unknown keys, string types and a 256-byte option
limit. Total design JSON stays limited to 2,048 bytes and custom necklines to 512
bytes. Trousers/skirts reject neckline/sleeves/custom geometry; shirts require
short/long sleeves and forbid custom geometry with a collar. No user SVG, HTML,
URLs, photo marks or preview shapes are accepted. Existing colour, length, name,
ownership, optimistic concurrency, retries and attached-design immutability rules
remain enforced. Snapshot creation copies options and geometry from the locked
server design in the submission transaction. Existing RLS/grants stay in place.

## Verification and remaining live checks

From `tailorme`, run `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`.
Tests exercise 210 supported new option combinations, distinct paths, custom
neckline preservation, conditional controls, compatible resets, garment-specific
alignment, source shape safety, service save/reopen, and participant rendering.
The local PGlite migration suite tests malicious/incompatible/oversized options,
new formats, ownership, stale versions, retry safety, request snapshots, privileged
source-change isolation, and existing format 1/2 source/snapshot fixtures across
the new migration. No hosted database is contacted by these tests.

For an authorized staging release:

- Confirm the migration order, grants/RLS, and PostgREST exposure of the new
  column/RPC results; refresh schema metadata using normal project procedures if
  needed. Open legacy preset and custom-neckline designs/requests unchanged.
- In a browser, select each new garment and every option. Inspect collars,
  waistbands/leg cuts, slits, lengths, colours, and custom necklines. Check reset
  feedback and keyboard/focus behavior when switching types/collars.
- On desktop and a native touch device, inspect photo alignment for each garment,
  including both trouser leg hems. Check relevant shape handles, symmetry and
  history for tops; verify trousers have no torso/sleeve/neckline editor.
- Save/reload each garment through the hosted API. Confirm format/options and SVG
  match. Use staging test accounts to check invalid payload rejection, foreign
  ownership and stale-version handling.
- Submit each garment after reviewing **Tailor will see this design**; reopen as
  customer and addressed tailor and compare the same final illustration/options.
  Retry a submission and confirm one snapshot. Check unrelated accounts cannot
  read the design/snapshot, and attached designs remain read-only.
- Verify a staging-only source mutation cannot alter an existing snapshot; do
  not modify real customer data for this check. Native visual/touch and hosted
  PostgREST checks remain manual; automated interaction tests mock layout.
