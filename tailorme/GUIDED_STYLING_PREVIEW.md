# Guided styling preview

This extends `PhotoStylingPreview`; the existing local JPEG/PNG/WebP selection,
5 MB limit, blob URL lifecycle, overlay and manual transforms are reused.
No service, database column, migration or request payload is added.

Choose **Align garment to photo**, then mark points in order by tapping/clicking
the photo. Dresses use shoulder, waist and hip pairs plus a hem centre. Blouses
use shoulder and waist pairs plus a hem centre; skirts use waist and hip pairs
plus a hem centre. Left/right mean the sides as viewed in the photo.

Numbered handles support dragging with pointer capture for mouse/touch. The
step buttons and two labeled coordinate sliders offer a keyboard alternative:
set both coordinates, then choose **Mark at current controls**. Invalid point
positions display an error and preserve the last valid points. All relevant
points are required before the original overlay is adapted. Undo stores up to
50 completed point edits, including reset; it does not include measurements or
the existing manual transform controls. Reset alignment removes the marks;
Reset illustration restores neutral move/size/rotation/opacity adjustments.

The preview maps the existing silhouette and all sleeve, custom-neckline and
detail paths between marked rows. Curves are sampled before mapping, so the
garment's filled cutout changes together with its outline. It interpolates
between rows; it does not infer anatomy, fabric behavior, ease or garment fit.
Pairs must span 5–90% of photo width, have no more than 15% photo-height tilt,
and have at least 3% vertical separation between rows. Hem flare follows the
existing illustration, bounded to the photo sides. Sleeve extrapolation is
bounded to a 25% margin. The photo remains proportional and its stage matches
the actual displayed image, without letterboxed areas in the coordinate space.

Manual move, proportional size, rotation and opacity still work. After guided
alignment, these adjustments offset the illustration from its marks. Reset
illustration to return to the marks. Switching garment type clears active
alignment; changing design details redraws the preview using the same marks.

## Direct garment shape editing

Choose **Adjust garment shape** to switch from whole-garment movement or photo
marking to local silhouette editing. Dresses and blouses show shoulder,
underarm, waist and hem handles, plus sleeve-end handles for short/long sleeves.
Skirts show waist and hem handles only. Shoulder handles move sideways;
sleeve-end handles change cuff width and sleeve length together. Labeled sliders
allow those dimensions to change independently. Underarm, waist and hem handles
change row width and depth. Vertical row positions are shared between sides to
keep the outline ordered. Sliders use illustration coordinates, not measurements.

Symmetry mirrors side widths and sleeve dimensions; turn it off for independent
left/right edits. Undo/redo and reset have a separate, bounded 50-edit shape
history. A completed drag is one history entry; canceled/lost-capture drags
restore their starting shape. Reset restores the original garment and can itself
be undone. Changing garment type, sleeve preset or length selects a fresh shape
editing context; the photo and all edits remain local. Photo replacement/removal
clears shape data along with alignment and measurements.

Shape edits rebuild the garment's closed filled path and sleeve polygons through
the existing SVG renderer. They do not add decorative outlines. The custom
neckline path remains intact, and waist seams/detail lines follow the changed
geometry. Existing photo alignment is applied afterward. Drag coordinates use
the SVG screen matrix and inverse alignment mapping so whole-garment position,
size and rotation are respected. Move/size/rotation controls resume after
**Finish adjusting shape**; opacity remains available during editing, while the
44 px handles stay visible independently of garment opacity and zoom.

Numeric bounds keep the neckline shoulders, underarms, waist and hem separated.
Sampled closed outlines are checked for self-intersections/degeneracy in source
and photo-aligned coordinates before accepting changes. Invalid changes preserve
the last valid shape and show an error. Alignment changes and shape-history
restoration also validate against the current combination. If photo alignment
collapses a sleeve or leaves a handle outside its invertible area, reduce the
edit, use sliders, or adjust/reset the alignment. Pointer capture, cancellation
and `touch-action: none` protect handle drags from page scrolling.

**Preview adjustments are not saved to your tailoring design.** Shape state is
never added to saved-design fields, tailoring requests or immutable snapshots.
The personal photo remains a local browser blob with the existing URL cleanup.

## Optional measurements

Shoulder width, bust/waist/hip circumference and garment length are local notes,
with explicit centimetre/inch labels and conversion at 1 inch = 2.54 cm.
Circumferences never determine image widths. Typing a measurement never changes
alignment automatically.

For dresses/blouses only, **Estimate hem from shoulder width and garment
length** can place the hem. This estimates pixels per centimetre from the marked
shoulder distance and optional shoulder-width measurement. It multiplies that
scale by garment length to estimate a vertical distance below the shoulder
midpoint. It accounts for the photo aspect ratio and rejects an off-photo hem.
The operation is undoable and still must satisfy point ordering. It assumes a
front-facing photo with approximately the same image scale at shoulders and hem;
pose, perspective and clothing can invalidate it. Skirts have no shoulder scale,
so their measurements remain notes and their hem is positioned manually.

## Privacy and verification

The blob URL, marks, undo history and measurements are component memory only.
Replacement/removal/decode failure clears marks and measurements; blob URLs are
revoked on replacement/removal/unmount. No preview information reaches design
save RPCs, request submission, immutable snapshots, storage, analytics or an
external API. The shared illustration renderer receives an optional preview-only
warp; saved-design and participant-request views use its original geometry.

Run from `tailorme`:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Focused tests cover relevant steps, partial/invalid marks, bounded mapping for
every garment/length, custom neckline and detail preservation, touch-style
pointer handlers, keyboard coordinate controls, undo/reset, unit conversion,
measurement validation, hem estimation and circumference independence. Privacy
checks cover transport separation and photo replacement/removal cleanup. The
full suite also covers existing ownership and snapshot workflows.

Shape checks additionally cover relevant handles for each garment/sleeve/preset,
independent sleeve and torso dimensions, symmetry, randomized bounded edits,
self-intersection rejection, inverse alignment mapping, filled-path replacement,
custom necklines, canceled pointer gestures, undo/redo/reset, and preservation of
whole-garment transforms and normal saved-design rendering.

Automated interaction tests execute real handlers with mocked layout; they do
not emulate native device touch or browser rendering. Before release, check a
portrait and landscape photo on desktop and an actual touch device, complete
each garment's steps, drag/reposition/undo points, use keyboard-only controls,
switch units, and confirm saved/request illustrations remain unchanged. No live
SQL or deployment is needed for this extension, and neither was performed.
Also check shape handles with a rotated/resized garment, asymmetric sleeve edits,
low/zero garment opacity, keyboard-only sliders, and cancellation during touch
dragging; finish shape mode and confirm whole-garment movement resumes.
