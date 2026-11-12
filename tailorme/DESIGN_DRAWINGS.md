# Decorative drawing on designs

**Draw on design** opens a canvas on the garment illustration. It is separate
from the neckline editor, local shape adjustment and personal-photo preview.
Pen mode draws with mouse/touch; Select stroke mode selects visible strokes, with
an equivalent labeled stroke list and delete button. Colour and width controls
apply to new strokes. Undo/redo retain up to 50 editing actions. Clearing all
drawings requires **Confirm clear drawings**, can be canceled with **Keep
drawings**, and can be undone.

Pan view is a separate gesture mode that never draws. Zoom and horizontal/
vertical pan sliders offer keyboard controls, and Reset drawing view restores
the original view. Pointer capture and `touch-action: none` prevent touch drags
from scrolling the page. Canceled/lost-capture pen gestures discard the unfinished
stroke. The SVG screen matrix maps zoomed/panned pointer coordinates back to
the base 320 × 480 garment coordinate space.

New strokes default to **Anywhere on canvas**, for arrows and design annotations
anywhere within the full design canvas. **On garment** clips new strokes to the
garment. Each stroke retains its mode when the tool's mode is changed. Existing
strokes without a mode remain **On garment**; they are not rewritten or unmasked.

Drawings are visual instructions for embroidery ideas, borders and patterns;
they are not automatic embroidery patterns and never change the garment cut.
Changing garment type keeps drawing data and clips it against the new garment.
For On garment strokes, outside points remain in the data but are not painted
outside the silhouette. Anywhere on canvas strokes are painted outside the
garment too. All strokes remain selectable/deletable through the stroke list.

## Shared rendering and privacy

`DesignIllustration` paints On garment polylines through an SVG clip path made from
the same filled garment paths it renders: body, sleeves and collars, including
custom neckline openings, trouser crotch/leg gaps and side slits. Anywhere on
canvas strokes bypass only this garment clip; the garment and cream canvas
remain visible. Mixed strokes retain their original stacking order. Every garment
type uses this shared layer in the designer, saved design, photo preview,
**Tailor will see this design**, and customer/tailor request views. Photo preview
warping transforms the drawing and clip together, but is still local only.

Saved decorations contain no photo, filename, alignment, measurement, zoom/pan,
selection or preview-shape data. Personal photos remain browser blobs and use
the existing URL cleanup. Only explicitly validated decorative stroke data is
added to design saves and request snapshots. The renderer never accepts user SVG,
HTML, CSS, URLs or executable markup.

## Exact migration and data format

Drawing storage migration: `supabase/migrations/20261028001400_design_drawings.sql`.
The new, unapplied mode extension is
`supabase/migrations/20261028001500_drawing_placement.sql`; apply it after 01400.
It replaces only the drawing validator to accept the optional per-stroke mode.
Existing JSON, defaults, RPC ownership/version checks and snapshots are untouched.
All earlier migrations remain unchanged. Apply in timestamp order after
`20261028001300_extended_garments.sql`, which itself follows customer designs and
custom necklines. Release the matching client after the schema/RPC migration.
No live SQL or deployment was performed for this change.

The migration adds `decorations jsonb not null` to `customer_designs` and
`request_design_snapshots`, defaulting existing rows to
`{"version":1,"strokes":[]}`. The decorative format has its own version; existing
garment format versions 1/2/3 and their geometry are preserved.

```json
{
  "version": 1,
  "strokes": [
    {"mode":"canvas","colour":"#b08d35","width":3,"points":[[4000,3000],[5000,3500],[6000,3000]]}
  ]
}
```

`mode` may be `canvas` or `garment`; absence means the legacy `garment` mode.
Explicit null, arbitrary strings and non-string modes are rejected. The drawing
format remains version 1 because the optional field preserves legacy semantics.
Coordinate pairs are normalized integer x/y values from 0 to 10,000 inclusive,
relative to the full 320 × 480 illustration, not body measurements. Width is an
integer from 1 to 12 illustration units. The fixed colour palette is charcoal
`#303039`, ivory `#f3e6ce`, ruby `#a8324a`, navy `#243c63`, sage `#789783`, and gold
`#b08d35`.

Both browser and server validate exact keys and types, at most 32 strokes,
2–256 points per stroke, at most 4,096 total points, palette colours, width and
coordinate bounds, and a 98,304-byte decorative payload. Total design JSON is
now capped at 131,072 bytes to accommodate drawings; existing 256-byte garment
option and 512-byte custom-neckline limits remain. Table constraints enforce the
drawing schema in addition to the save RPC. Unknown keys, SVG/HTML, arbitrary
colours, malformed coordinates and unsupported drawing versions are rejected.

The save RPC preserves existing decorations when an older client omits that
field. Explicit empty strokes clear it. Existing role/owner checks, row locking,
version conflicts, retry idempotency and attached-design read-only behavior are
preserved. Request submission copies decorations from the locked saved design
in the same transaction as the other snapshot fields. Participants have SELECT
access only; previously submitted snapshots never follow source edits.

## Verification

From `tailorme`:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Tests cover schema limits, normalization, actual editor pen/select/pan handlers,
pointer cancellation, history, confirmation before clearing, exact clipping
paths for all garment types/custom necklines/collars, save/reopen, combined
participant rendering and photo-data exclusion. The PGlite suite applies all
migrations to local Auth/Storage fixtures and verifies hostile payload rejection,
table constraints, ownership/RLS, retries, older-client saves, immutable snapshot
copies and legacy rows without drawings. Tests do not contact hosted Supabase.

Remaining live verification steps, for an authorized staging release:

1. Apply `20261028001400_design_drawings.sql` and then
   `20261028001500_drawing_placement.sql` after all predecessors through the
   normal migration workflow. Verify new columns, grants/RLS and PostgREST RPC
   results; refresh schema metadata using normal project procedures if needed.
2. Open existing format 1/2/3 designs and old requests; verify unchanged geometry
   and no drawings. Save an older-client payload without `decorations` over a
   staging decorated design and confirm its strokes remain.
3. With desktop mouse and native touch, draw on each garment, including custom
   necklines, shirt collars, side slits and trouser gaps. Verify clipping in those
   openings in On garment mode. Draw arrows in empty canvas space in Anywhere on
   canvas mode; save/reopen and inspect the thumbnail and request confirmation.
   Check that pre-existing clipped drawings remain clipped and mixed-mode strokes
   retain their own clipping and stacking order. Check pen colour/width, click/list selection, deletion, undo/redo,
   clear confirmation/cancellation, and canceled gestures.
4. Zoom/pan, then draw again; verify points land correctly. Confirm Pan view never
   draws, touch drawing does not scroll, keyboard tool/zoom/pan controls have
   visible focus, and disabled/attached designs cannot be edited.
   Resize the browser at zoom 100% and 200% and repeat canvas-space drawing. Pen
   and pan events target the canvas frame even over unpainted areas; select mode
   restores SVG hit testing. Pointer coordinates use the actual SVG inverse screen
   matrix, not a guessed container rectangle. Automated tests cover scale,
   translation and resizing with affine matrices; native browser/device behavior
   still requires this visual release check.
5. Save/reload a decorated custom-neckline design through hosted APIs. Test
   malformed/oversized payloads, stale versions and foreign ownership using
   staging accounts; check rejection without mutation.
6. Review the combined design before submitting a tailoring request. Reopen as
   customer and addressed tailor and compare identical strokes/geometry. Retry
   submission and confirm one snapshot. Verify unrelated accounts cannot read
   it and attached designs remain read-only. Use staging fixtures only for a
   privileged source-edit demonstration; the existing snapshot must remain fixed.
7. Inspect network payloads: only garment fields plus `decorations` may be sent.
   Photos, filenames, alignment, measurements and local shape edits must be absent.

Native rendering/touch behavior and hosted PostgREST checks remain manual release
checks. Automated interaction tests run the real handlers with mocked layout.
