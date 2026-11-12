# Custom neckline editor

The Dress Designer supports neckline replacement for dresses and blouses. Choose
**Edit neckline**, draw from the left shoulder anchor to the right within the
marked region, and adjust the three interior points with dragging or labeled
keyboard/touch sliders. Symmetry mirrors the side depths. Undo/redo operate on
draft geometry; Cancel leaves the applied design unchanged. Apply replaces the
neckline segment of the closed, filled garment silhouette. Reset restores the
selected preset. Choosing another preset also removes the custom curve.

Drawing is intentionally constrained: one left-to-right stroke, no backtracking,
at most 2,048 sampled points, within SVG coordinates x=143–177 and y=65–120.
Invalid strokes are rejected without changing the last valid draft or design.
The original neckline is a dashed editing guide only, never part of the final
custom garment. This editor is separate from decorative drawing and does not
add a personal-photo feature, an AI service, or a paid dependency.

## Stored geometry and server validation

New migration: `supabase/migrations/20261028001200_custom_necklines.sql`.
Earlier migrations are unchanged. No hosted SQL or deployment was performed.

The migration adds `format_version` (default 1) and nullable `custom_neckline`
to both designs and request snapshots. Existing rows retain their preset and
receive format 1 with no custom geometry. Custom designs use format 2:

```json
{"format_version":2,"custom_neckline":{"depths":[65,80,104,90,65]}}
```

The five x coordinates are fixed at 143, 151.5, 160, 168.5, and 177. Endpoint
depths must equal 65; the three interior depths are numeric, 65–120 inclusive,
with at most one decimal place and at least one depth greater than 65. Cubic
Bezier segments use horizontal controls at one-third and two-thirds of each
x interval. Each segment is strictly increasing in x and lies inside its control
hull. Thus supported curves cannot self-intersect, overshoot, or intersect the
rest of the garment outline. Drawing backtracking/crossings are rejected before
conversion. This is a constrained curve editor, not an arbitrary SVG editor.

The save RPC accepts only explicit design fields, formats 1/2, at most 2,048
bytes of design JSON and 512 bytes of custom geometry. Geometry may contain only
the five numeric depths. No SVG paths, HTML, scripts, extra attributes, arbitrary
control coordinates, or URLs are accepted. Table constraints also enforce the
geometry contract. Skirts cannot carry custom necklines. A missing format is
treated as legacy format 1; preset-only clients remain supported.

Existing role checks, owner RLS, version conflict detection, retry idempotency,
and attached-design read-only rules are preserved. Request submission locks the
saved design and copies its format and geometry into the snapshot; it does not
accept client-supplied snapshot geometry. Both participants use the same
`DesignIllustration` component. Snapshots are separate rows, inaccessible for
authenticated writes, and do not follow subsequent source changes.

## Local verification

From `tailorme`:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Tests include geometry bounds/schema/smoothness, crossing/backtracking rejection,
draft Apply/undo/redo/cancel/reset, silhouette replacement without the old path,
service save/reopen, and equivalent participant rendering. The PGlite database
suite applies every migration to local Auth/Storage fixtures and tests malformed
and oversized geometry, format rejection, ownership, stale saves, immutable
snapshots, retries, existing tailoring workflows, and rows created before this
migration. PGlite does not exercise hosted Supabase/PostgREST or browser layout.

## Migration and live verification steps (pending, for an authorized release)

1. Review the additive migration and run the commands above. In an authorized
   staging project, apply migrations in timestamp order through the normal
   Supabase migration workflow, including `20261028001200`; do not rerun or edit
   applied historical SQL. Release the matching client after the schema is ready.
2. In the hosted API, confirm both columns are exposed and the save and request
   RPCs return/copy them. If PostgREST retains stale schema metadata, refresh its
   schema cache through the project's normal operational procedure.
3. Open a legacy preset design and an older request as their participants;
   confirm their silhouette and saved values are unchanged.
4. With a customer test account, edit dresses and blouses using a mouse and an
   actual touch device. Draw inside/outside the region and cross back over the
   stroke. Confirm errors preserve the last valid curve. Drag each point, toggle
   symmetry, undo/redo, cancel, reset, and change presets. Verify the garment's
   filled cutout changes only on Apply. Test keyboard-only sliders/buttons,
   visible focus, screen-reader labels, and narrow-screen scrolling.
5. Save an asymmetric custom design; reload/reopen it. Confirm control depths,
   format 2, and silhouette match. Attempt unsupported format/geometry, oversized
   payloads, and a foreign design ID through authenticated test RPC calls; verify
   rejection and no mutation. Test a stale expected version in another session.
6. Choose a tailor. Verify **Tailor will see this design** and the final garment
   before submission. Submit, reload the request as customer and addressed tailor,
   and compare the same custom cutout. Verify an unrelated account cannot read
   it. Retry the same submission ID and confirm exactly one snapshot.
7. Confirm attached designs remain read-only and their snapshot remains fixed.
   Source-mutation isolation is covered by a privileged local fixture test; do
   not modify real customer data for a live check. Use staging fixtures if a
   privileged source-change demonstration is necessary.

These browser/device/hosted checks remain manual release checks; the automated
interaction harness runs real handlers but does not simulate browser layout or
native touch dispatch.
