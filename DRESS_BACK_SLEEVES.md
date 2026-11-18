# Dress back neckline and sleeves

## Implementation

The existing sleeve field is the sole saved sleeve choice. Template dresses support sleeveless, short and long sleeves in Front/Back SVG views and the lazy local WebGL renderer. Sleeve side panels replace the upper side-wall armholes, share their boundary vertices and end in open cuffs. Left/right winding is mirrored for outward normals. Procedural geometry uses no external assets, models, textures or services; no third-party asset license is required (the repository's own license status still applies).

`back_neckline` is optional JSON `{version:1,preset:"round"|"v"|"square",depth:number,width:number}`. Depth is 4�45 and width 20�42 illustration units, not body measurements. The bounded region preserves shoulders and keeps both independent cutouts above the chest row. An omitted/null value uses the previous shallow round back: depth 7.2222222222, width 34. Reading old designs never writes those defaults into the database. Existing snapshots are not rewritten.

The shared illustration renders the same back settings in the designer and requester/provider request snapshot. Front custom geometry, artwork and collar behavior remain intact. The Back view intentionally excludes front-only artwork/collars and labels this limitation. Refined dress proportions/sleeves are reused by the Back SVG. 3D still does not represent custom front curves, collars, decoration/artwork or refinement geometry; these omissions remain visible. No custom back drawing is offered. The `none` sleeve option is unsupported in dress 3D and labelled explicitly; no saved option is reset.

Geometry updates retain camera orientation/zoom, and a rejected update retains the previous valid GPU mesh. Rotation, Front/Back/Detail, zoom, reset, lazy loading and disposal remain in place. Personal photos and camera/preview state are not sent in save RPCs or request snapshots.

## Database execution order � not applied by this change

1. Confirm migrations 001�028 are already applied, ending in `20261031002800_tailors_as_requesters.sql`.
2. Review and execute **only** `supabase/migrations/20261113002900_dress_back_neckline.sql` as the next migration, using the normal Supabase migration process. Do not rerun or edit 001�028.
3. Release the matching frontend after the migration, then verify authenticated save/reopen and request creation. The migration adds nullable columns, narrow validation, a wrapper around the existing authorized/version-checked save RPC, and a before-insert snapshot-copy trigger. It does not change RLS, participants, buckets or existing snapshot values. No bucket setup is needed.

No live SQL or deployment has been performed. Local PostgreSQL tests use PGlite with Auth/Storage fixtures, not a hosted project.

## Remaining manual/live checks

Browser/native automation was unavailable. Desktop/mobile visual checks and actual touch/drag gestures remain unfinished. Verify all 9 front/back preset pairs from front, back and angled views; depth/width limits; short/long cuffs and shoulders; colour updates without camera jumps; keyboard sliders; phone scrolling and rotation; WebGL loss/fallback; and existing custom-front/collar confirmation behavior. Check that the mannequin stays visible through both cutouts and that sleeves have no visible seams, gaps or z-fighting on supported devices. This remains a standard-mannequin illustration, not a fit, sizing or draping prediction.

After applying 029 in the intended environment, verify a new saved design reopens, a new request freezes its back/sleeve values, both participants see identical views, unrelated accounts cannot read it, attached edits remain denied, and pre-029 request snapshots retain their legacy appearance.

## Files changed

- `tailorme/src/utils/backNeckline.ts` (new schema, defaults, SVG path)
- `tailorme/src/services/designService.ts` (validation, editable fields, save/refine payloads)
- `tailorme/src/components/portal/GarmentOptionsControls.tsx` (independent bounded back controls)
- `tailorme/src/components/portal/DesignIllustration.tsx` (explicit Front/Back rendering)
- `tailorme/src/utils/previewShape.ts` (reuse refined body with alternate opening)
- `tailorme/src/components/portal/DesignPreviewTabs.tsx` (Back SVG and accurate support information)
- `tailorme/src/components/portal/RequestDesign.tsx` (shared snapshot Back view)
- `tailorme/src/utils/dressPreview3d.ts` (back/sleeve synchronization and omissions)
- `tailorme/src/utils/dressNecklineMesh.ts` (back cutout and connected open sleeves)
- `tailorme/src/components/portal/dressWebglRenderer.ts` (mesh updates and last-valid preservation)
- `tailorme/src/components/portal/DressPreview3d.tsx` (prop updates and warning state)
- `tailorme/src/pages/Designer.css` (scoped accessible back controls)
- `supabase/migrations/20261113002900_dress_back_neckline.sql` (new migration 029)
- `supabase/tests/dress_back_neckline.sql` (local authorization/persistence/snapshot regression)
- `tailorme/tests/database.test.mjs` (register 029 workflow suite)
- `tailorme/tests/dress-back-sleeves.test.mjs` (new geometry/options/persistence tests)
- `tailorme/tests/dress-necklines-3d.test.mjs`, `tailorme/tests/dress-preview-3d.test.mjs` (expanded supported geometry expectations)
- `tailorme/THREE_D_PREVIEW.md` (update support/limitations)
- `DRESS_BACK_SLEEVES.md` (this documentation)

## Local verification

Build passed (existing main-chunk size warning); lint passed; complete test suite: 244/244 passed. Tests include local PostgreSQL migration/authorization/snapshot checks and existing designer, collar, neckline, sketch and workflow regressions. Actual browser visuals and gestures remain unfinished.
