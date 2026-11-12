# Collar styles and refinement silhouettes

Collar controls are shared by garment customization and Refine as garment.
None, Shirt collar, Mandarin/stand collar and Peter Pan collar are available
for dress, blouse, shirt, kurti and salwar top. They are hidden for skirt,
trousers and blank sketches.

## Compatibility and confirmation

All three non-None styles use the round preset opening. V, square and custom
curves remain available with None. Selecting a collar on an incompatible cut
does not change the design: a warning offers **Use round neckline and apply
collar** or **Keep current neckline**. Only confirmation replaces the cut/custom
curve. With an active collar, incompatible neckline choices are disabled and
the custom editor is available again after choosing None.

The separate-colour checkbox starts off: null colour means match the current
garment fill dynamically. A checked colour is an explicit validated #RRGGBB.
Changing an explicit legacy shirt collar's colour moves it into the new control
without adding a duplicate template collar. None clears a separate collar colour.

Actual bounded collar paths follow the existing round neck endpoints and share
the DesignIllustration renderer for editing, thumbnails, refinement comparison,
styling preview and participant request details. Photo alignment warps those
same paths locally; no photo or alignment data is saved or uploaded. Drawing
layers and original sketch references are retained.

## Legacy designs

Missing/null collar metadata means a legacy row. An explicit legacy shirt
`garment_options.collar` of point/band retains its existing geometry. Designs
without an explicit legacy collar show None. New designs default to None,
including newly selected shirt templates. No old snapshot is backfilled or
rewritten. A new collar selection uses the separate metadata and suppresses
the legacy geometry to prevent duplicates.

## Straight, A-line, Flared and hem width

The earlier refinement had Fitted/Straight/Flared choices and an independent hem
slider. It now has shared **Straight / A-line / Flared** presets in guided
refinement anchors, also available after reopening a refined design. Presets
set bounded waist/hem proportions. The independent **Hem width** slider changes
only hem width, leaving waist, length, sleeves, neckline and collar intact; an
adjusted preset becomes Custom proportions. Trousers retain their existing leg
style controls. These are deterministic template controls, not sketch recognition.
Existing saved numerical shapes are preserved, including older fitted shapes.

## Migration 019 and prerequisites

The existing `20261029001900_collar_styles.sql` is complete; no duplicate migration
was created. Apply missing migrations in chronological filename order:

1. Existing portal, authorization, request and design migrations 001 through 016.
2. `20261029001700_my_measurements.sql`.
3. `20261029001800_template_refinement.sql`.
4. `20261029001900_collar_styles.sql`.

Verify the project's migration history first and never rerun an applied migration.
019 requires 018's save wrapper, refinement RPC and snapshot additions, plus the
earlier Auth/RLS/template contracts. Apply it before releasing this frontend.
No live SQL has been applied and nothing has been deployed.

019 adds private collar fields, server-side type/combination/colour validation,
a transactionally wrapped save RPC and snapshot-copy trigger. The renamed
internal save helper is not executable by anonymous or authenticated clients.
Existing owner/participant RLS still applies. Collar changes participate in
version/retry checks. Requests copy the selected collar/colour atomically with
the geometry, drawings and optional original sketch reference; later edits do
not alter snapshots. Removing a collar and choosing a custom cut is one save
transaction, including rollback if validation or attachment restrictions fail.

## Verification and remaining browser checks

Run build, lint and the complete test suite from `tailorme`. Tests exercise
all styles on suitable tops, incompatible/custom cuts, explicit confirmation,
legacy geometry, matching and separate colours, shared/warped rendering,
save/reopen, refinement serialization, snapshot copying, rollback, ownership
and legacy compatibility. Local SQL uses isolated PGlite Auth/Storage fixtures.

Verified locally: build and lint pass, and all 163 tests pass. The full SQL runner
applies migrations 001 through 019 in order, including the existing collar suite.

Remaining browser checks: desktop/mobile controls and thumbnails; keyboard and
screen-reader confirmation flow; colour picker focus; round/None/custom toggles;
collars under touch-driven photo alignment; real-auth staging save/reopen and
request details. No browser visual inspection or hosted/concurrent-session test
was performed. Vite's application bundle-size advisory remains.
