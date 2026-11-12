# Line cleanup

In **Draw your own design**, choose **Line cleanup**, Gentle or Medium, and
Whole sketch or Selected strokes or shapes. Selection supports multiple items.
Before and After use the existing artwork renderer, identical canvas scale and
background. Original structured artwork stays unchanged until Apply. Cancel
discards the preview. Apply adds exactly one drawing undo entry and clears the
redo branch. A stale preview cannot replace artwork changed outside the editor.
Use Save design privately after applying to persist the result.

Cleanup is free, synchronous browser computation. There is no API, upload,
image conversion, inference, garment generation or automatic silhouette editing.
Separate strokes remain separate. Existing Close shape and fill tools remain
explicit. Colours, fills, placement modes, item types and layer order survive.
The optional consistent outline width affects only the targeted items; it is
off by default and supports the existing integer widths 1 through 12.

## Geometry and limits

The algorithm uses the existing 320 x 480 renderer metric for normalized integer
points. One weighted smoothing pass caps point displacement at 0.35 pixels
(Gentle) or 0.7 pixels (Medium). Coordinates are rounded once to existing integer
precision. Iterative Ramer-Douglas-Peucker simplification uses 0.18 or 0.4 pixel
tolerance and splits at protected anchors. There is no iterative curve fitting,
extrapolation or new stroke creation. Processing never increases point counts.

Endpoints, global extrema and turns of at least 35 degrees (plus neighbours)
are protected. Marks with a bounding diagonal below 12 pixels, paths with
endpoints less than 4 pixels apart, and intersecting paths retain their original
geometry. Closed outlines, rectangles and ellipses always retain their geometry,
including filled boundaries. Output introducing a collapsed segment or crossing
falls back to the original points. The result must pass the existing validator:
32 items, 256 points per item, 4,096 points overall and a 96 KiB artwork limit.
Protected details may therefore produce no change at either setting.

## Storage and compatibility

No migration or data-format change is needed. Cleanup uses the existing v1/v2
structured artwork fields; blank sketches continue using artwork v2 and design
format 4. Save/reopen, authorization, request idempotency and snapshot handling
are unchanged. Attached designs remain read-only. Request snapshots store copied
artwork, so later work cannot silently modify an existing request reference.
No live SQL was applied and nothing was deployed.

## Verification

From `tailorme`, run `npm.cmd run build`, `npm.cmd run lint` and `npm.cmd test`.
Geometry tests cover deterministic output, displacement bounds, corners, endpoints,
small details, gaps, crossings, selection, optional width, metadata and maximum
input sizes. Real editor-handler tests cover preview, Cancel, Apply, single-step
undo/redo, multi-selection, stale previews and disabled editing. Local PGlite
tests save and reopen actual cleanup output, submit it through the existing
request workflow and verify immutable snapshots and legacy artwork compatibility.
The complete existing request, measurements and design suites also run.

Remaining manual checks: desktop/mobile visual comparison, keyboard focus and
screen-reader announcements, touch selection, and a staging browser save/reopen
with real authentication. No hosted database or concurrent network sessions are
used by these local checks. Vite's application bundle-size advisory remains.
