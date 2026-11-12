# Blank sketch interaction checks

Blank sketches activate the editor without a second activation button. Pencil is the initial tool. Erase item removes the touched SVG stroke/shape in one undoable operation. Selection, fills, transformations and layer ordering retain the existing implementation. Coordinates continue to use the inverse SVG screen matrix, including CSS zoom and page offsets. Pointer capture and touch-action:none remain on the canvas; only Select and Erase item enable artwork hit testing.

No data format, server, migration, photo handling or snapshot changes.

Automated checks: build, lint and all Node test suites, including immediate blank-sketch drawing, erase/undo/redo, fill, transforms, normalized coordinates under transformed/resized views, save/reopen, authorization and immutable snapshots.

Browser verification remains pending: this session's computer-use inventory returned no browsers and an unavailable native pipe, so actual browser drawing or hosted save/reopen was not verified. On a connected local browser:
1. Enter Draw your own design; verify Pencil is selected, controls are visible, and no Draw on design activation button appears.
2. Draw with mouse and touch, scroll the page, resize the viewport, then zoom/pan and draw again; verify the marks follow the pointer.
3. Tap Erase item, touch a stroke and a filled shape; undo and redo each removal.
4. Select an outline, close/fill it, move/resize it and reorder shapes.
5. Save, leave and reopen the sketch; verify artwork, fills and order. Verify the tailoring preview and existing immutable request snapshot remain identical after later edits.
6. Repeat on a narrow mobile viewport; canvas drags must not scroll the page, while toolbar scrolling must work.

No live SQL or deployment was performed.
