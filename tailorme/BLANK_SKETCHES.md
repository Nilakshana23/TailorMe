# Blank sketches and artwork v2

Optional browser-only [Line cleanup](LINE_CLEANUP.md) adds Gentle/Medium preview,
selected-item or whole-sketch processing, and one-step Apply/Undo without changing
the artwork format or existing request snapshots.

Sketch sharing is labeled **Customer design reference**. See
[SKETCH_SHARING.md](SKETCH_SHARING.md) for the final sharing audit, exact full
migration order (including 015), authorization checks and remaining live checks.

The designer has two modes: **Customize a garment** retains all existing garment
templates and their tools; **Draw your own design** renders a blank 320 × 480
canvas with no garment. Category, title and notes are optional for sketches.
Blank titles save as “Untitled sketch”. Category is descriptive metadata, never
a template or an automatic geometry conversion. No AI images are generated.

Both drafts, their artwork and separate drawing-editor history/view state remain
in memory while switching modes. The existing personal-photo preview stays
mounted but hidden while sketching, so its local photo/alignment is not copied
into a sketch or discarded merely by switching modes. Save each mode separately.
In-app navigation uses the router blocker with Keep editing / Discard and leave;
reload/tab close uses the browser before-unload warning whenever either draft
has unsaved changes. Approved navigation/unmount loses in-memory drafts and local
views; there is no browser persistence or recovery after reload/session loss.
The app now uses React Router's data router to support navigation blocking.

## Drawing and colours

Pen, rectangle, ellipse, selection and pan are separate tools. Draw rectangles
and ellipses between opposite corners. Select an item with a pointer or the
item list. Selected items support outline colour/width changes, deletion and
forward/backward layer movement. Closed shapes also support chosen fill and
position/size sliders in percentages of the canvas. Open strokes stay unfilled.
**Close shape** is enabled only for an outline with at least three points,
nonzero bounded area and no self-intersections or touching nonadjacent edges.
Rectangles and ellipses are inherently closed. There is no general paint bucket.

Undo/redo, confirmed clearing, normalized pointer coordinates, mouse/touch capture
and separate zoom/pan controls are reused. Clear and transforms are undoable.
The 28 named presets cover neutrals, pastels, bright and dark shades. Custom
colour pickers and validated six-digit HEX inputs are available. Garment fill,
pen colour and selected-shape fill are independent. Invalid HEX retains the last
valid colour. Actual fabric colours can differ from the screen. Canvas background
is a view-only setting, separate from artwork; it is not shared or persisted.

## Storage and exact migration

New, unapplied migration:
`supabase/migrations/20261028001600_blank_sketches.sql`.
Apply in timestamp order after `20261028001500_drawing_placement.sql` and all of
its predecessors, then release the matching client. Earlier migrations are
unchanged. No hosted SQL or deployment was performed.

The migration adds `design_kind` (default `garment`), `notes`, nullable
`sketch_category` and nullable `garment_fill` to designs and request snapshots.
Existing template formats 1/2/3 and artwork v1 remain supported without data
rewrites. Sketches use `design_kind=sketch`, design `format_version=4`, and artwork
`version=2`. The save RPC accepts sketches without template fields. Internal
canonical values in the legacy non-null template columns are never rendered as a
garment for a sketch. Template options are neither required from the customer
nor inferred from the artwork. Category may be null or an existing garment slug.
If no category is given, request submission asks for a garment description/type
through the existing request form instead of guessing one.

Artwork v2 retains the ordered `strokes` array as its layer list. Every item has
normalized integer points, `colour`, `width`, and optional `mode`. Additional
v2-only fields are `kind` (`stroke`, `rectangle`, `ellipse`), `closed` (boolean)
and `fill` (null or HEX). Rectangles/ellipses store two opposite bounding-box
corners; an explicitly closed stroke stores its polygon outline. Example:

```json
{
  "design_kind":"sketch",
  "format_version":4,
  "name":"My design",
  "notes":"A border and sleeve idea",
  "sketch_category":null,
  "decorations":{
    "version":2,
    "strokes":[
      {"kind":"rectangle","mode":"canvas","colour":"#123ABC","width":3,
       "fill":"#FEDCBA","points":[[1000,1000],[6000,6000]]}
    ]
  }
}
```

Canvas sketches require canvas-mode artwork; templates retain both clipping
modes. Points are 0–10,000 inclusive on each axis, with 2–256 points per item,
at most 32 items and 4,096 points overall. Widths are integers 1–12. V2 outline,
fill and garment-fill colours must match `#RRGGBB`; v1 retains its original
palette restriction. Rectangles/ellipses must have positive bounding dimensions;
closed outlines must be simple and have double-area at least 100 normalized
units. Open strokes cannot carry a fill. Notes are limited to 2,000 characters,
artwork to 98,304 bytes and the total design payload to 131,072 bytes. Existing
garment-option/custom-neckline limits remain unchanged.

The server rejects unknown keys, arbitrary SVG/HTML/CSS, URLs, unsupported kinds,
non-finite/unbounded/fractional coordinates and unsupported formats. The RPC and
table constraints enforce the schema and geometry. Ownership, expected-version
checks, retries and attached-design read-only rules remain in place. Request
submission copies mode, category, title, notes, fill and ordered artwork from the
locked saved row into the immutable snapshot. The shared renderer displays the
same result for saved designs, thumbnails, request preview, customer and tailor.
Personal photos, alignment, measurements and local shape adjustments remain
outside this payload and are never shared with sketches or tailoring requests.

## Verification and remaining live checks

From `tailorme`, run `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test`.
Tests cover v2 validation, valid/invalid closing, rectangle/ellipse drawing,
custom colours, selected-item editing, moves/resizes, ordering, undo/redo,
mode-draft preservation and navigation blocking, blank rendering, save/reopen
and identical snapshot rendering. PGlite applies the full migration sequence
against local fixtures and tests malformed/oversized art, closed-geometry
rejection, optional metadata, ownership, stale/attached rules and snapshots.

For an authorized staging release, remaining manual checks are:

1. Apply exactly `20261028001600_blank_sketches.sql` after all predecessors using
   the normal migration workflow. Confirm new fields/RPC output through hosted
   PostgREST; refresh schema metadata if required by project procedures.
2. Open legacy garment designs/requests and confirm unchanged rendering. Save and
   reopen sketches with and without category/title/notes, filled shapes, custom
   HEX colours and changed layer order. Test invalid payload rejection directly
   with staging accounts, including foreign ownership and stale versions.
3. On desktop and native touch, draw and select each kind, close valid outlines,
   reject crossing outlines, change outline/fill/width, move/resize, reorder,
   undo/redo, clear/cancel, zoom/pan and draw after browser resizing. Check
   keyboard focus and all palette/custom-colour controls at narrow widths.
4. Edit both modes, switch repeatedly and confirm separate drafts/history remain.
   Check route links, browser back/forward and reload warnings; cancel leaving,
   then explicitly discard. Regression-check auth routes, deep links and portal
   navigation after the data-router change. Native browser prompts are subject
   to the browser's user-activation rules.
5. Review “Tailor will see this design”, submit a categorized and uncategorized
   sketch, and compare the combined result as customer and addressed tailor.
   Verify retry idempotency, unrelated-account isolation and snapshot immutability.
6. Inspect save/request network payloads to confirm that no personal photo,
   filename, alignment, measurement, preview shape or canvas view/background data
   is present. Native touch, layout and hosted API checks are manual release
   checks; automated interaction tests execute real handlers with mocked layout.
