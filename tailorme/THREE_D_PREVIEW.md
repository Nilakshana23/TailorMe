# Browser 3D Preview MVP

The Dress Designer has accessible **2D Design / 3D Preview** tabs. 2D stays the authoritative saved/shared illustration. Its drawing editor and browser-only photo styling preview stay mounted when changing tabs, preserving their local state.

Template dresses, blouses, skirts, shirts, trousers, kurtis and salwar tops render in 3D. Blank sketches remain explicitly unsupported. The feature does not upload photos, use measurements, build a customer body model or perform virtual try-on.

## Representation and limitations

The local procedural model represents current dress colour (including custom garment fill), short/midi/long length, and round, V or square applied custom or preset front neckline openings and independent back presets and sleeveless, short or long sleeves on a standard mannequin. Back depth/width are bounded saved illustration settings. A separate **Illustration silhouette (preview only)** selector implements Straight, A-line and Flared skirt profiles. That selector does not reinterpret or modify a saved silhouette. It resets when the renderer unmounts.

Preset neckline openings replace the actual upper mesh boundary and filled surface. Their proportions follow the 2D presets: round is quadratic, V has a centre point and square has vertical sides and a horizontal base. Back settings use independently versioned presets; omitted settings retain the legacy shallow round opening. No top cap bridges either cutout. Sleeves replace side armhole panels and have open cuffs. Collars, drawings/decorations, their fills and layer order, and custom refinement geometry are not reconstructed in 3D. The UI lists the applicable omitted details and directs the user to 2D. No fabric simulation, construction accuracy, sizing or fit prediction is provided.

Displayed text:

> 3D design illustration — a simplified preview on a standard mannequin. It does not predict your size, fit or fabric draping.

## Implementation, privacy and licenses

- The mannequin and dress are generated from original local surface-of-revolution and ellipsoid geometry in `src/components/portal/dressWebglRenderer.ts` and `src/utils/dressNecklineMesh.ts`. There are **no bundled third-party model, texture, photo, font or asset files for this feature**, and no asset licenses to import. Original geometry/code follows this repository's project licensing; no separate third-party asset rights are asserted.
- Native browser WebGL is used. No new npm dependencies, paid service, AI API, CDN or model endpoint was added. Existing React/Vite dependencies retain their existing licenses.
- The renderer and its shaders/geometry are dynamically imported only when a supported 3D tab is selected. The production build emits a separate `DressPreview3d-*.js` chunk. Other pages do not initialize WebGL or download that renderer.
- Camera rotation, tilt, zoom and illustration silhouette live in component/renderer memory. They are never added to `DesignFields`, save payloads, database records or immutable request snapshots. The existing save and 2D share paths remain unchanged.
- Rendering is on demand (no perpetual animation loop), uses a pixel ratio capped at 2, observes canvas resizing, and releases buffers, shaders, programs, observers, listeners and the context when unmounted. Context loss, allocation/shader errors, failed lazy loading and absent WebGL have readable fallbacks.

## Interaction

Mouse drag rotates/tilts; horizontal touch drag rotates. Vertical touch remains page scrolling (`touch-action: pan-y`). Zoom is intentionally provided by labelled mouse/touch/keyboard buttons, with bounded distance; wheel scrolling remains page scrolling. Rotation/tilt buttons, Front, Back, the closer neckline Detail view, and Reset view are keyboard-accessible. Preset/colour/length updates reuse the current camera. Initial framing is closer and width-aware on mobile. The tabs use roving focus and Left/Right/Home/End navigation. No camera gesture changes a design.

## Verification and remaining checks

Focused tests cover tab switching, unsupported designs, colour/length and silhouette geometry, detail notices, unchanged save/share payloads, finite bounded camera transformations, absent WebGL and resource/listener disposal. Existing designer, snapshot and workflow tests remain applicable.

Current results after back-neckline/sleeve support: build and lint passed; 244/244 tests passed, including geometry, synchronization and local PostgreSQL persistence/authorization tests. The renderer remains a separate lazy bundle. The existing main-bundle-size warning remains.

Visual and actual pointer/touch/WebGL interaction checks must still be completed on desktop and mobile hardware. Check rotation, zoom limits, reset, scrolling over the canvas, live colour/length updates, tab restoration of 2D drafts, WebGL denial/context loss, and a supported browser with device-pixel-ratio/responsive resizing. The browser inventory check reported “The browser access host is unavailable.” Earlier native browser access was blocked by its URL policy check; no bypass was attempted. No live SQL or deployment was performed. Back-neckline persistence now requires migration 029 after 001-028; see ../DRESS_BACK_SLEEVES.md for exact order and remaining live checks.

## Files changed for preset neckline support

- `src/utils/dressNecklineMesh.ts` (new)
- `src/utils/dressPreview3d.ts`
- `src/components/portal/dressWebglRenderer.ts`
- `src/components/portal/DressPreview3d.tsx`
- `src/components/portal/DesignPreviewTabs.tsx`
- `src/components/portal/DressPreview3d.css`
- `tests/dress-necklines-3d.test.mjs` (new)
- `tests/dress-preview-3d.test.mjs`
- `THREE_D_PREVIEW.md`

## Overall 3D implementation files

- `src/pages/DesignerPage.tsx` — wraps the existing 2D preview, preserving its controls.
- `src/components/portal/DesignPreviewTabs.tsx` — tabs, explicit scope, limitations, lazy loading and error boundary.
- `src/components/portal/DressPreview3d.tsx` — preview controls and renderer lifecycle.
- `src/components/portal/DressPreview3d.css` — scoped responsive preview styling.
- `src/components/portal/dressWebglRenderer.ts` — original local WebGL renderer and procedural mannequin/dress.
- `src/utils/dressPreview3d.ts` — read-only representation mapping and implemented silhouette profiles.
- `tests/dress-preview-3d.test.mjs` — focused regression tests.
- `THREE_D_PREVIEW.md` — this implementation/license/limitations report.

Production output under `dist` is regenerated by the build. The original 3D MVP required no backend changes. Independent saved back necklines now require migration 029; see ../DRESS_BACK_SLEEVES.md.

## Sleeve mesh correction

The first sleeve implementation connected a narrow vertical bodice seam directly to a horizontal cuff. Its ruled triangles could be finite and outward-facing while forming narrow strips and failing to cover the upper arm. It had no shoulder transition or intermediate arm sections, and the outer chest intersected the inner-arm region.

The renderer now shares mannequin arm coordinates with the garment geometry. A raised, tilted shoulder ring transitions the existing armhole into horizontal elliptical rings around the actual vertical arm axis. Short cuffs end on the upper arm; long sleeves continue toward the wrist. Sleeves and bodice share the root vertices; side-wall faces underneath are omitted, cuffs remain open, and sleeveless leaves clean armholes. Only the outer chest is tapered for clearance; neckline corners remain unchanged. No 2D rendering, saved data, snapshots, migrations or camera settings changed.

Changed files for this correction: src/utils/dressNecklineMesh.ts, src/utils/mannequinGeometry.ts (new shared arm dimensions), src/components/portal/dressWebglRenderer.ts, tests/dress-sleeve-clearance.test.mjs (new), and this document.

Verification: build and lint passed; full suite 246/246 passed. New tests sample both arms at shoulder, upper-arm and wrist heights from front/back/outward angled rays, and full tube cross-sections below the armhole; check clearance against the ellipsoid, shared root edges, open cuffs, finite vertices, winding and normals. Geometry tests do not establish visual correctness. Actual front/back/side rendering, desktop/mobile gestures and sleeve appearance remain unfinished: browser host and native automation were unavailable. No live SQL or deployment was performed.
## Shoulder rounding and cuff taper

The shoulder transition now uses ten cubic-curve rings instead of a single angular bend. The curve retains the exact bodice root and approaches the vertical sleeve shaft tangentially. Sleeve-only area-weighted normals reduce faceted shading without smoothing neckline corners. Eight shaft sections taper gently toward open cuffs: short sleeves use cuff radii .098/.112; long sleeves use .075/.09. Arm-clearance sampling remains in place, including the shoulder tip.

Back neckline geometry and saved settings were not changed. New mesh ray tests distinguish Round/V/Square back cutouts and depth/width changes, and verify the front boundary is unchanged. Geometry checks establish mesh differences, not visual appearance.

Files changed for this polish: src/utils/dressNecklineMesh.ts, src/utils/mannequinGeometry.ts, tests/dress-sleeve-clearance.test.mjs, and this document. Build passed (existing main-bundle size warning), lint passed, and the full suite passed 248/248 tests. Camera, colour, length, 2D rendering, persistence and snapshots are unchanged. No migration, live SQL or deployment.

Visual verification remains unfinished: browser/native automation was unavailable. The referenced screenshots were not present in the conversation, so no screenshot comparison was performed. Front/back/side appearance, transitions and taper still require actual browser inspection.

## Applied custom front necklines

The 3D front opening now uses the existing validated custom_neckline.depths field, not a second persisted representation. necklineX anchors 143, 151.5, 160, 168.5 and 177 map to bodice x=(x2d-160)*.31/40. Height maps to y=.78-(y2d-65)*.63/130. The shared customNecklineDepthAt evaluator uses the exact SVG cubic smoothstep in each fixed-x interval, retaining asymmetric depths and both shoulder anchors. The 3D mesh samples 64 intervals plus existing angular samples, so its boundary is a tessellated approximation between samples, not an exact analytic curved surface. There is no top fill, fan or overlay across the cutout.

The existing editor already isolates drawing/slider drafts. Apply publishes the validated curve to both renderers; Cancel does not publish; Reset publishes null and restores the selected preset. Existing collar compatibility, save versioning, custom geometry validation and immutable snapshots remain unchanged. Unsupported collars, artwork and refinement notices remain. Invalid custom geometry is rejected before GPU replacement, with a visible warning retaining the prior mesh and camera. A newly opened invalid design has a clear no-valid-geometry error instead.

No migration or backend change is needed: existing format 2/3 custom fields and snapshots already persist and validate the curve. No 3D-specific geometry, camera or personal-photo data is added to saves. Symmetric/asymmetric saved designs reopen through the same field.

Files changed for custom front support:
- src/utils/necklineGeometry.ts (shared exact cubic depth evaluator)
- src/utils/dressNecklineMesh.ts (validated custom boundary and replacement surface)
- src/utils/dressPreview3d.ts (applied curve synchronization; remove obsolete omission)
- src/components/portal/DressPreview3d.tsx (custom prop updates without camera reset)
- src/components/portal/dressWebglRenderer.ts (custom mesh update; useful retained-mesh errors)
- src/components/portal/DesignPreviewTabs.tsx (accurate support information)
- tests/dress-custom-neckline-3d.test.mjs (new geometry, editor interaction, persistence and renderer tests)
- tests/dress-necklines-3d.test.mjs and tests/dress-preview-3d.test.mjs (updated supported details and prop synchronization)
- THREE_D_PREVIEW.md (this report)

Verification: build and lint passed; full suite 253/253 passed, including exact cubic mapping, symmetry/asymmetry, front/angled cutout rays, Apply/Cancel/Reset interaction, invalid-update preservation, camera stability, save/reopen and existing local PostgreSQL snapshot regressions. Existing main-bundle size warning remains. Browser/native automation was unavailable, so actual 2D/front/detail/angled visual comparisons remain unfinished. Geometry tests do not establish visual equivalence. No live SQL or deployment was performed.

## Remaining template garments

The renderer now dispatches by the existing garment_type and garment_options fields. Tops reuse the validated custom/preset neckline boundary, rounded attached sleeves and open cuffs. Distinct bounded body profiles supply their actual length/hem construction; a shirt is not drawn as a long dress. Skirts start at the waist, and trousers use a separate hip-to-crotch bifurcation with two leg tubes. The shared crotch edges are joined; no disk or skirt panel bridges the legs. All new geometry is local procedural code, with no bundled assets, new dependencies or asset-license requirements.

| Garment | Represented in 3D |
| --- | --- |
| Dress | Existing colour/fill, lengths, applied custom/preset front, independent saved back, sleeveless/short/long sleeves; unchanged dress mesh path |
| Blouse | Cropped/hip/tunic body lengths, colour/fill, custom/preset front, sleeveless/short/long sleeves |
| Skirt | Waistband to short/midi/long open hem, colour/fill; existing Straight/A-line/Flared illustration selector |
| Shirt | Distinct body and rounded hem, waist/hip/longline lengths, colour/fill, custom/preset front where compatible, short/long sleeves, raised placket and small domed buttons |
| Trousers | Joined hip/crotch, two separate open legs, knee/ankle/full lengths, straight/tapered/wide leg geometry, flat or lightly corrugated elastic waistband, colour/fill |
| Kurti | Longer straight-hem top, supported lengths, colour/fill, custom/preset front, sleeveless/short/long sleeves, none/short/long open side slits |
| Salwar top | Distinct slightly narrower body and rounded hem, supported lengths, colour/fill, custom/preset front, sleeveless/short/long sleeves, none/short/long open side slits |

Limitations: collars (including legacy shirt point/band options), artwork, custom refinement proportions/silhouettes, darts/stitching, and trouser fly/pocket details are not reconstructed. Applicable omissions remain visible. Neckline curves and surfaces are tessellated approximations. The trouser waistband corrugation illustrates the elastic option only; it is not fabric simulation. All new tops use the legacy shallow round back because their existing schema has no independent saved back neckline. Saved back settings are consumed only for dresses. Nothing resets a saved option or expands the persistence schema. The existing silhouette selector is preview-only for dress/skirt; saved refinement shapes remain authoritative in 2D and are explicitly unsupported in 3D.

Front/Back/Reset frame the current garment; Detail targets a top neckline or bottom waistband. Initial loading frames the current type. Live option/type updates reuse the same renderer and preserve the current camera, so a user can use the existing view buttons to reframe after a switch. Mouse/touch/keyboard controls, lazy loading, WebGL fallbacks and GPU/listener disposal are retained. No generated meshes/camera settings/personal photos are saved or shared. Existing 2D rendering and immutable snapshots are unchanged. No migration is needed, and no applied migration, live SQL or deployment was changed/performed.

Files changed for this extension:
- src/utils/garmentMesh3d.ts (new garment geometry, pants topology, profiles/placket/slits and framing)
- src/utils/dressNecklineMesh.ts (optional top body construction; dress defaults unchanged)
- src/utils/dressPreview3d.ts (type/options synchronization and accurate omissions)
- src/components/portal/dressWebglRenderer.ts (dispatch, bounded validation, camera targets, buffer replacement)
- src/components/portal/DressPreview3d.tsx (type/options updates and contextual existing controls)
- src/components/portal/DesignPreviewTabs.tsx (supported templates and accurate labels)
- tests/garment-preview-3d.test.mjs (new per-garment and switching tests)
- tests/dress-necklines-3d.test.mjs and tests/dress-preview-3d.test.mjs (expanded support/prop expectations)
- THREE_D_PREVIEW.md (this report)

Verification: build and lint passed; complete suite 261/261 passed. New tests cover all seven types/three lengths, distinct geometry, option synchronization, custom top openings, slits, open cuffs, waist/crotch continuity, finite bounded positions/unit normals, outward trouser leg faces, sampled mannequin torso/hip/leg clearance, camera-preserving type switches and GPU disposal. Existing dress/custom-neckline, sleeve, save and local database snapshot regressions remain covered. The existing main-bundle size warning remains.

Visual verification is unfinished: browser host and native automation were unavailable. Front/back/angled appearance for every type, mobile touch/scroll and device-specific WebGL must be checked in a real browser. Geometry tests do not establish visual correctness or rule out every intersection. The standard-mannequin illustration disclaimer remains; no measurement-based fit or fabric-draping prediction is made.
