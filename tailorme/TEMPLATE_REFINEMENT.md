# Refine as garment

Refinement now includes the shared [collar controls](COLLAR_STYLES.md), plus
Straight/A-line/Flared presets and an independent hem-width control. Existing
saved geometry and original sketch references are preserved.

This is deterministic **Template-based refinement**, separate from Pencil,
Rectangle/Ellipse drawing, explicit Close shape, and Line cleanup. There is no
automatic recognition of garment parts, generative model, paid API or upload.

Save the original sketch first. In its editor, choose Refine as garment, select
Frock/Dress, Top/Blouse, Skirt, Shirt, Trousers, Kurti or Salwar top, and identify
the outline items. Decorative items are unchecked by default. Only selected
items contribute to the bounding box; none of the original artwork is changed.
The last selected outline item is highlighted in the original preview.

Use selected outline proportions initializes bounded template widths and length
from that box. Shoulder/waist/hem and sleeve anchors are illustration controls,
not personal measurements. Confirm neckline, sleeves/collar, silhouette or
trouser leg style, and length. Compare the original and proposed illustration.
Changing a choice clears confirmation. Confirm and save creates a new linked
design; Cancel makes no writes. Saving uses one frozen UUID/payload for retries.
An ambiguous failure keeps that submission locked for exact retry.

The original sketch is retained. A server-built, versioned copy of its full
structured artwork and notes is also stored privately on the new design.
Buttons, pleats and decorations are not interpreted, transferred to template
geometry or silently erased. Include the reference to communicate those details
to a tailor. The inclusion checkbox is visible during refinement and can be
changed on the new design before sharing. The request composer shows the exact
refined illustration and included original reference; an excluded reference is
explicitly identified as excluded. Request details render only copied snapshots.

## Persistence and migration order

Apply existing migrations **001 through 017 in chronological filename order**,
then `supabase/migrations/20261029001800_template_refinement.sql`. On an existing
project, verify history and apply only missing migrations. Release this frontend
after 018. No applied migration was edited. No live SQL or deployment was done.

Migration 018 adds nullable bounded numeric geometry, a server-built sketch
reference and a reference-inclusion flag to private designs and request
snapshots. It wraps the existing validated save function, revokes direct access
to the renamed base helper, and adds the confirmation/ownership/version-checked
creation RPC. A snapshot insert trigger copies saved geometry and only the
selected reference in the existing atomic request transaction. All existing
participant/owner RLS, immutable snapshot privileges and request retry paths
remain in force. Existing rows keep null geometry/reference and render as before.
References remain stable even after source edits or deletion. No photo data or
styling-preview alignment is read, persisted or sent by refinement.

The normal garment editor supports the saved anchors, drawing, fills and custom
neckline tools. Changing garment category resets incompatible template geometry;
the linked original reference is retained. Attached designs remain read-only.

## Deliberate limitations

- This is a symmetrical template starting point, not an exact trace, sewing
  pattern, fit prediction or automatic interpretation of arbitrary sketches.
- Bounding boxes initialize general proportions, not semantic shoulder or waist
  locations. Anchor values are constrained to safe illustration ranges.
- Neckline, sleeves, seams, collars, slits and leg shapes use the existing
  template system. Customers must adjust details manually or retain the reference.
- A linked reference is a private versioned copy. Later source changes do not
  propagate to it or to submitted snapshots. Excluding it from a request does not
  delete the private copy.

## Verification and remaining checks

Run `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test` from `tailorme`.
Tests cover selected-only bounds, deterministic initialization, all seven
templates at anchor extremes, valid/custom neckline geometry, explicit
confirmation, frozen retries, save/reopen, source ownership, anonymous/admin
denials, immutable request snapshots, optional reference exclusion, source
deletion and legacy compatibility. SQL runs in local PGlite Auth/Storage fixtures.

Local result: build and lint pass; all 159 tests pass. Geometry checks exercise
all seven categories across 128 combinations of the bounded anchor extremes.

Remaining browser checks: desktop/mobile side-by-side comparison and scrolling,
keyboard/assistive-technology outline selection and confirmation, touch sliders,
real-auth staging save/reopen, and lost-response/concurrent RPC retries. Browser
visual verification has not been performed. Hosted SQL and deployment require
separate authorization. Vite's bundle-size advisory remains.
