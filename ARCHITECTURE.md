# ARCHITECTURE.md — Aislez Technical Architecture

---

## System Overview

Aislez has two independent applications that communicate through a single file format.

```
┌─────────────────────────────────┐
│           BUILDER               │
│     (Electron Desktop App)      │
│                                 │
│  Canvas → Fixtures → Products   │
│                                 │
│  Save: project.ifp              │
│  Export: datapackage.json       │
└──────────────┬──────────────────┘
               │ datapackage.json
               ▼
┌─────────────────────────────────┐
│           SHOPPER               │
│      (React Browser App)        │
│                                 │
│  Load JSON → Render Map →       │
│  Search → Highlight Fixture     │
└─────────────────────────────────┘
```

Both applications exist and run — Shopper lives in its own separate repo (`aislez-shopper/`, sibling to `aislez-builder/` on disk but not part of this git history; see [Shopper Architecture](#shopper-architecture) below), consistent with the two connecting only through the exported JSON file, no shared code. See [What's Actually Built vs Planned](#whats-actually-built-vs-planned) below before trusting any section as current behavior.

---

## What's Actually Built vs Planned

| Area | Status |
|---|---|
| Canvas, zoom/pan, grid, rulers | ✅ Built |
| Fixture placement, chains, multi-select, alignment guides | ✅ Built |
| Location codes (manual assignment + chain auto-numbering) | ✅ Built |
| Store perimeter (custom/rectangle shape, outward adjustable thickness) | ✅ Built |
| Interior walls (place, resize, rotate, outline styling) | ✅ Built |
| Entrances (hosted on the perimeter outline) | ✅ Built |
| Wall ↔ perimeter and wall ↔ wall seam blending | ✅ Built |
| Fixture/wall containment (can't overlap walls or leave the store) | ✅ Built |
| Perimeter sketch tool rejects self-intersecting outlines | ✅ Built |
| Floorplan image background layer (upload, scale/reposition/rotate, opacity) | ✅ Built |
| Background photo calibration (click 2 known-distance points to set scale) | ✅ Built |
| Lock the background photo in place (prevent accidental drag/resize) | ✅ Built |
| Undo/redo for background photo move/resize/calibrate | ✅ Built |
| Save/load `.ifp` project file, launch start screen | ✅ Built |
| CSV import + column mapping + auto-linking + Relink | ✅ Built |
| Product list sidebar (highlight-on-click, detail editor, per-field settings) | ✅ Built |
| Export JSON data package (fixtures, walls, entrances, shopper-visible product fields) | ✅ Built |
| Shopper app — map, search, highlight-on-select, independent map zoom/pan | ✅ Built |
| Shopper deployed to Netlify, demo landing page | ⬜ Planned (Phase 8) |

The rest of this document describes the built parts as they actually work, and the planned parts as design intent (clearly marked). See [BUILDORDER.md](BUILDORDER.md) for phase-by-phase sequencing.

---

## File Formats

Both formats are built: `.ifp` (Phase 4) is Builder's own editable save file; the JSON data package (Phase 6) is the separate, stripped-down snapshot exported for Shopper.

### .ifp Project File (Builder saves/loads this — built)
The full editable project. JSON under the hood, renamed .ifp. `ProjectFile` in `types/index.ts` mirrors real store state exactly (world units in meters/feet, not pixels) rather than the flat placeholder this section used to show:

```json
{
  "version": "1.0",
  "settings": {
    "name": "Mock Walmart - Section B",
    "unit": "meters",
    "storeWidth": 30,
    "storeHeight": 20,
    "gridSnap": 1,
    "storeOutline": [{ "x": 0, "y": 0 }, { "x": 30, "y": 0 }, { "x": 30, "y": 20 }, { "x": 0, "y": 20 }],
    "perimeterThickness": [0.2, 0.2, 0.2, 0.2],
    "backgroundImage": null
  },
  "customFixtureTypes": [
    { "id": "builtin_0", "name": "Shelf", "width": 1.2, "height": 0.5, "color": "#4A90D9", "abbrev": "SH" }
  ],
  "wallDefaults": { "width": 3, "height": 0.2 },
  "fixtures": [
    { "id": "fixture_001", "type": "shelf", "locationCode": "B3-1", "x": 2, "y": 3.3, "width": 1.2, "height": 0.5, "rotation": 0, "label": "B3-1" }
  ],
  "walls": [
    { "id": "wall_001", "x": 5, "y": 5, "width": 3, "height": 0.2, "rotation": 0 }
  ],
  "entrances": [
    { "id": "entrance_001", "edgeIndex": 0, "offset": 10, "width": 1 }
  ],
  "products": [
    {
      "id": "product_001", "itemName": "Heinz Ketchup 500ml", "sku": "94823", "price": 3.99,
      "category": "Condiments", "locationCode": "B3-1", "fixtureId": "fixture_001",
      "Department": "95",
      "shopperVisible": { "itemName": true, "price": true, "category": true, "sku": false, "Department": false }
    }
  ],
  "columnMap": { "SKU": "sku", "ITEM_NAME": "itemName", "PRICE": "price", "DEPARTMENT": "Department" },
  "requiredFields": ["itemName", "sku"]
}
```

`products`/`columnMap`/`requiredFields` are optional in the `ProjectFile` type specifically so a `.ifp` saved before Phase 5 still loads (`hydrateProject` defaults each to empty) — see **Save/Load** in Key Logic below for how save/load is actually wired, and **Products, CSV Import, and Auto-Linking** for what these three fields mean.

### JSON Data Package (Shopper will load this — built)
Exported from Builder (`utils/exporter.ts`'s `buildDataPackage`). Shopper-facing only — internal-only fields are stripped out entirely, not just hidden. Includes walls and entrances (not part of the original sketch, added so Shopper's map reads as a real store rather than floating fixture rectangles), and `store` carries the actual `storeOutline`/`perimeterThickness` rather than a derived pixel bounding box. Each fixture's `color`/`abbrev` are resolved by Builder at export time (`resolveFixtureColor`/`resolveFixtureAbbrev`, `FixtureLayer.tsx`) — covers both built-in types and the project's own `CustomFixtureType`s — so Shopper never needs a color table of its own; same idea for `store.wallColor`. This was a real bug caught during Phase 7 dev: the first version of the exporter only resolved built-in-type colors, so any fixture using a retailer-defined custom type (a plain `type: 'custom'` with no color info) exported with nothing to render:

```json
{
  "version": "1.0",
  "store": {
    "name": "Mock Walmart - Section B",
    "unit": "meters",
    "storeOutline": [{ "x": 0, "y": 0 }, { "x": 30, "y": 0 }, { "x": 30, "y": 20 }, { "x": 0, "y": 20 }],
    "perimeterThickness": [0.2, 0.2, 0.2, 0.2],
    "wallColor": "#2c3e50"
  },
  "fixtures": [
    { "id": "fixture_001", "type": "shelf", "label": "B3-1", "locationCode": "B3-1", "color": "#4A90D9", "abbrev": "SH", "x": 2, "y": 3.3, "width": 1.2, "height": 0.5, "rotation": 0 }
  ],
  "walls": [
    { "id": "wall_001", "x": 5, "y": 5, "width": 3, "height": 0.2, "rotation": 0 }
  ],
  "entrances": [
    { "id": "entrance_001", "edgeIndex": 0, "offset": 10, "width": 1 }
  ],
  "products": [
    { "id": "product_001", "fixtureId": "fixture_001", "itemName": "Heinz Ketchup 500ml", "price": 3.99, "category": "Condiments" }
  ]
}
```

Note what's *not* here: no `sku`, no `locationCode`, no `Department`, no `shopperVisible` map on that product — in this example the retailer left those non-visible, so `stripProduct` (`exporter.ts`) drops them from the object rather than exporting them as `null`/empty. `id` and `fixtureId` are always kept regardless of visibility — Shopper needs `fixtureId` to know which fixture to highlight, and it isn't customer-facing text.

---

## Builder Architecture

### Folder Structure (current)

Files marked `[planned]` are not yet implemented.

```
aislez-builder/
├── scripts/
│   └── dev.js                       # Clears ELECTRON_RUN_AS_NODE before launch
├── src/
│   ├── main/
│   │   └── index.ts                 # Electron main process, window, native menu (Undo/Redo/Delete/Save/Open/Export via IPC), project:save/project:open/export:save file dialogs
│   ├── preload/
│   │   └── index.ts                 # Electron preload (context bridge) — exposes electron.ipcRenderer.invoke, used directly for file I/O, no extra API surface needed
│   └── renderer/src/
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Root layout + Toolbar (contextual property panels per selection type); Ctrl+S/Ctrl+O and menu:action → save/open
│       ├── types/
│       │   └── index.ts             # Fixture, Wall, Entrance, ProjectSettings, ProjectFile, Product/ColumnMap/ShopperVisibility, DataPackage — all built
│       ├── components/
│       │   ├── Canvas/
│       │   │   ├── StoreCanvas.tsx        # Konva Stage, zoom/pan, rubber-band select, drop handler
│       │   │   ├── FixtureLayer.tsx       # Fixture rendering, chain groups, multi-select, alignment guides
│       │   │   ├── WallLayer.tsx          # Interior walls: move/resize, outline, perimeter seam blending
│       │   │   ├── EntranceLayer.tsx      # Entrances hosted on storeOutline edges: slide/resize
│       │   │   ├── PerimeterWallLayer.tsx # Store perimeter as an outward-thickened border band
│       │   │   ├── PerimeterDrawLayer.tsx # Perimeter sketch tool (Draw mode) — click corners, perpendicular snap
│       │   │   ├── CalibrateLayer.tsx     # Calibrate mode — click 2 points at a known real-world distance, scales the background photo to match
│       │   │   ├── ArrowLayer.tsx         # Arrow-extend buttons for chain rows
│       │   │   ├── GridLayer.tsx          # Dot/line grid
│       │   │   ├── Ruler.tsx              # Horizontal + vertical rulers
│       │   │   └── BackgroundLayer.tsx    # Floorplan reference photo — scale/reposition/rotate, renders bottommost
│       │   ├── Sidebar/
│       │   │   ├── FixtureLibrary.tsx       # Drag-to-canvas palette: Wall, Entrance, built-in + custom fixtures
│       │   │   ├── ProductList.tsx          # Imported products: click a linked one to highlight+center its fixture, double-click to edit, delete, Fields/Relink buttons
│       │   │   ├── ProductFieldSettings.tsx # Per-field Required/Shopper-visible menu — same UI as import's ColumnMapper, reopenable anytime
│       │   │   └── ProductDetailModal.tsx   # Edit one product's standard + custom fields directly; re-links on save if locationCode changed
│       │   ├── StartScreen.tsx            # Launch screen when no project is open: "New Project" or "Open Project"
│       │   ├── NewProjectDialog.tsx       # New project setup: name, unit, rectangle/custom shape, grid snap
│       │   ├── ProjectSettingsModal.tsx   # Edit project settings at any time
│       │   └── Import/
│       │       ├── CSVImporter.tsx    # Modal orchestrator: upload → map columns → summary
│       │       ├── ColumnMapper.tsx   # Per CSV column: target field (standard or custom-named), Required, Shopper-visible; live preview table
│       │       └── ImportSummary.tsx  # Imported/linked/unlinked/skipped counts after confirming the mapping
│       ├── store/
│       │   ├── canvasStore.ts       # Fixtures, walls, entrances, selection, undo/redo history, chain ops, loadCanvas (bulk replace on file open)
│       │   ├── projectStore.ts      # Project settings (unit, store outline, per-edge perimeter thickness, grid snap, background image), custom fixture types, wall defaults, currentFilePath, loadProject
│       │   ├── productStore.ts      # Imported products, columnMap, requiredFields; import/set/update/delete a product, per-field visibility/required setters
│       │   └── uiStore.ts           # Zoom/pan/viewport, active tool, grid mode, Ctrl-held tracking, tooltip
│       └── utils/
│           ├── chain.ts             # Chain traversal, code parsing, direction logic
│           ├── chainState.ts        # Chain state helpers
│           ├── geometry.ts          # Polygon/rect math: containment, outward offset, edge projection, wall↔perimeter/wall↔wall flush detection, self-intersection check
│           ├── locationCode.ts      # Location code utilities
│           ├── projectFile.ts       # serializeProject/hydrateProject — collect all store state (including products) into a ProjectFile, or replace store state with one
│           ├── fileActions.ts       # saveProject/saveProjectAs/openProject/exportDataPackage — call the main process's file dialogs via IPC, wrap projectFile.ts/exporter.ts
│           ├── exporter.ts          # buildDataPackage — pure transform: current store state → stripped-down, shopper-visible-only DataPackage
│           ├── csvParser.ts         # parseCsv — hand-rolled RFC4180-ish parser (quoted fields, embedded commas/newlines, CRLF/LF)
│           └── autoLinker.ts        # linkProductsToFixtures + relinkAllProducts — match product.locationCode to fixture.locationCode, set fixtureId
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json  # Solution-style — typecheck via `npm run typecheck`, not `tsc --noEmit`
└── package.json
```

### State Management
**Zustand**, four stores:

**canvasStore** — owns:
- Fixtures (position, size, rotation, chain links `prevId`/`nextId`, location code)
- Interior walls (position, length, thickness, rotation)
- Entrances (`edgeIndex` + `offset` + `width` — hosted on one storeOutline edge, not free-standing)
- Selection state: fixture / chain anchor / multi-select / wall / entrance / perimeter-edge (mutually exclusive — selecting one clears the others)
- Undo/redo history (snapshots of fixtures + walls + entrances; capped at 50)

**projectStore** — owns:
- Project settings: name, unit, `storeOutline` (closed polygon, world units — the single source of truth for the interior boundary), `perimeterThickness` (parallel array, one thickness per outline edge), grid snap
- Derived values: `pixelsPerUnit`, `gridSizePx`
- Custom fixture type library (built-ins + retailer-defined types)
- Default length/thickness used when a new wall is dropped onto the canvas
- `currentFilePath` — the open `.ifp`'s disk path, or null if never saved/opened; drives whether Ctrl+S resaves quietly or prompts

**productStore** — owns:
- `products` (each a `Product`: standard fields `itemName`/`sku`/`price`/`category`/`locationCode`, `fixtureId` set by the linker, `shopperVisible` map, plus any retailer-named custom fields via the catch-all index signature)
- `columnMap` — the last import's CSV-header → field-name mapping (informational; not needed for anything to keep working)
- `requiredFields` — field names currently marked "every item needs this," edited from the Fields panel, independent of any one import

**uiStore** — owns:
- Zoom, pan, stage dimensions, active tool (`select` | `draw`), grid mode (`dots` | `lines` | `off`), tooltip, Ctrl-held tracking (for canvas panning)

### Key Logic

**Store perimeter vs. interior walls — two distinct concepts**
`storeOutline` (a closed, axis-aligned polygon in `projectStore`) is the *only* thing that defines the interior boundary — it's what `rectInsidePolygon` checks fixtures and walls against, and it never changes shape when perimeter thickness changes. The perimeter is rendered as a border band that grows **outward only** from that polygon, by a thickness that's adjustable per edge (hold-drag the handle on a selected side — deliberately built on raw `window` mouse listeners rather than Konva's own drag system, so it can never get stuck following the cursor after release — or type a value into the toolbar's PERIMETER panel). The sketch tool that draws `storeOutline` (`PerimeterDrawLayer.tsx`, `geometry.ts`'s `wouldSegmentSelfIntersect`) rejects any new segment that would retrace an earlier one (same line, overlapping range) or cross a non-adjacent one — the preview line and length label turn red and the click/Enter is silently ignored, so a hand-drawn outline can never end up self-intersecting. Interior walls are a completely separate `Wall` entity — placed from the sidebar, always solid, real footprint that blocks fixture placement. Walls are visually unified wherever they touch *anything* — the perimeter (`isWallSideFlushWithOutline`) or another wall (`wallSideTouchesOtherWalls`): a side touching either suppresses its own border, and its fill is grown by a constant-screen-pixel hairline on that side (`fillPatch` in `WallLayer.tsx`) to bridge the antialiasing seam that would otherwise show between two separately-rendered fills of the same color — the same technique `PerimeterWallLayer.tsx` uses for the wall-vs-perimeter case. The wall-vs-wall check is whole-side (not partial-interval) — a side touching another wall along only part of its length loses its border for the whole side, a deliberate simplification.

**Wall placement is blocked exactly like fixtures — continuously, not just on drop**
`wallPlacementBlocked` (`WallLayer.tsx`) rejects any wall position/size that would overlap another wall, overlap a fixture, or leave the perimeter — checked on the initial sidebar drop (`StoreCanvas.tsx`) and, critically, on *every* move/resize drag frame via `dragBoundFunc`/`handleResizeMove`, not only when the drag ends. A blocked candidate position is rejected in place, so the wall visibly sticks at the last valid spot/size instead of passing through and only snapping back on release (an earlier end-of-drag-only version produced exactly that jarring rubber-band effect).

**Entrances are hosted objects, not free-standing**
An `Entrance` doesn't have its own x/y — its geometry is entirely derived from `edgeIndex` (which storeOutline edge it's on) plus `offset`/`width` along that edge. It can only slide or resize along its host edge. Dropping the sidebar item snaps to whichever outline edge is nearest, within a threshold. Its rendered opening is a filled quad spanning the full local `perimeterThickness` (not just a thin marker line), so it reads as an actual break in the wall rather than a decoration sitting on top of it (`EntranceLayer.tsx`). The invisible draggable body used for sliding it also carries its own `onClick`/`onTap` (not just `onDragStart`) so a plain click selects it — without that, only a drag (which happens to also call `selectEntrance`) would ever select an entrance.

**Floorplan background image — scale it first, then trace the outline on top (or the reverse)**
A photo (`BackgroundImage` in `projectStore`, base64 + world-unit x/y/width/height/rotation/opacity) has no idea what "1 meter" means on its own. Two ways to fix that: draw the outline first (with real, typed measurements) and drag a corner to stretch/reposition the photo until its printed walls line up with the outline already on the canvas — resize is corner-only and always uniform-scaled from the corner-to-corner diagonal distance, so it's impossible to stretch the image out of its own proportions once aligned. Or, more commonly for a retailer who's starting from a real blueprint/photo and wants to trace it: calibrate the photo *first*, via `CalibrateLayer.tsx`'s "Calibrate" tool — click two points a known real-world distance apart anywhere in the image (a labeled wall, a column grid spacing, anything readable off the photo, not necessarily the overall footprint), type that distance, and the image rescales so those two points measure exactly that far apart, then its position resets to (0,0) — not anchored on whichever point was clicked, so there's always a clean, predictable baseline to start tracing from (same idea as `PerimeterDrawLayer.tsx`'s own `finalize()` shifting a finished sketch's bounding box to start at (0,0)). `BackgroundLayer.tsx` renders bottommost but still beneath `PerimeterDrawLayer`/`CalibrateLayer` regardless of active tool (`StoreCanvas.tsx`'s layer order is fixed, not conditional on which tool is active), so the now-correctly-scaled photo stays visible underneath while the Draw tool traces the real outline on top of it. Rotation is 90°-increment only: `rotateBackgroundImage` swaps width/height and keeps the box's center fixed, while `BackgroundLayer.tsx` pre-swaps the *image's own* width/height and pivots it on its own center (via `offsetX`/`offsetY`) so the rotated content still exactly fills that same box. Opacity goes to 0 (fully invisible). `BackgroundImage.locked` disables the Group's `draggable` and hides the resize-handle Groups entirely (not just visually — if they're not rendered, they can't be dragged either), so panning/zooming the canvas or dragging a fixture sitting on top of the photo can't accidentally bump it; the selection stroke switches to a muted gray instead of white as the locked-state tell. Rotate/Calibrate still work while locked since they're deliberate button actions, not mouse drags.

**Click-to-place tools (Draw, Calibrate) share one points buffer; the background photo has its own separate undo history**
`uiStore`'s `toolPoints`/`pushToolPoint`/`popToolPoint` are generic — not owned by `PerimeterDrawLayer.tsx` or `CalibrateLayer.tsx` specifically — so a corner placed while sketching the outline and a reference point placed while calibrating the background photo are the same kind of state. `setActiveTool` always clears `toolPoints`, so entering or leaving any click-to-place tool always starts clean. Each layer still owns its own `Backspace`-pops-last-point keydown listener locally. Separately, moving (drag-end), resizing (corner drag-end), and calibrating the background photo are undoable too, via `projectStore`'s own `pastBackground`/`futureBackground`/`undoBackground`/`redoBackground` — a second, independent history alongside canvasStore's fixture/wall/entrance one, since the image lives in `projectStore` and isn't a canvas object. `updateBackgroundImageWithHistory` (used by `BackgroundLayer.tsx`'s drag/resize-end handlers and `CalibrateLayer.tsx`'s `applyCalibration`) snapshots the pre-change `BackgroundImage` before applying an update; plain `updateBackgroundImage` (used by the opacity slider) does not, so dragging that slider doesn't flood the history with one entry per tick. `App.tsx`'s `performUndo`/`performRedo` are the single place all three tiers get resolved — toolPoints first, then background history, then canvasStore — shared by the toolbar buttons, Ctrl+Z/Ctrl+Y, and the Electron Edit-menu actions so the three never drift out of sync with each other. These are separate stacks, not one merged chronological timeline: Undo resolves to whichever tier is active/non-empty, not strictly "the single most recent action across all of them."

**Location Codes (manual, not auto-generated from position)**
Auto-deriving a code from canvas X/Y was tried and de-scoped — retailers already have their own aisle/bay numbering, so pixel-position-based codes would conflict with real-world layouts. Instead:
1. Retailer selects a fixture or chain, types a prefix (e.g. `B3`) into the toolbar's **Code** field, and a starting section number into the **#** field (defaults to 1)
2. Chain head's prefix propagates through the whole chain, auto-numbered sequentially from that starting section (`B3-1, B3-2, …`); `#` is read-only for any non-head member
3. Duplicate-prefix detection warns in real time and suggests the next free section number before it's committed

**Chain system**
Fixtures can link into a doubly-linked row via `prevId`/`nextId` (`utils/chain.ts` has the traversal/direction helpers). A chain locks to whichever direction (up/right/down/left) its first two members established — it can only extend or shrink along that one axis, never branch.
- **Arrow-extend**: a selected standalone fixture shows an extend arrow in every direction that isn't already occupied by an adjacent fixture; a chain only shows one arrow, on its tail, in the chain's locked direction.
- **Detach**: dragging a chain member less than 0.5 world units snaps it back into place; past that threshold it detaches (the chain splits — the two remaining ends are *not* auto-bridged) and moves freely.
- **Rejoin/link**: dropping a detached fixture (or a moved chain's head/tail) adjacent to another chain's open end auto-links them, grid-snap mode only; grid-off is a free placement with no auto-linking.
- Chain-level select/move/rotate/duplicate/delete operate on the whole row at once via `ChainGroup`, which wraps every member in one draggable Konva Group so they move together in real time.

**Selection model — single click, double click, and Ctrl both mean something different**
- **Click** a fixture → selects just that one fixture, even if it's part of a chain.
- **Double-click** a fixture → selects its whole chain (or just itself if standalone).
- **Ctrl+click** → toggles that one fixture in/out of the multi-selection.
- **Ctrl+double-click** → adds the fixture's *whole chain* to the multi-selection (detected via a module-level click-timing check, not Konva's `onDblClick` — the first Ctrl+click re-renders the fixture into a different Konva node, so a native dblclick never fires on the same node twice).
- **Rubber-band drag** on empty canvas → multi-selects every fixture whose bounds intersect the box.
- Selection is otherwise mutually exclusive across fixture / chain / multi / wall / entrance / perimeter-edge — selecting one clears the others (see `canvasStore`).

**Alignment guides and grid-mode magnet snapping**
Two mutually-exclusive snap mechanisms, both cross-type (fixtures and walls snap against each other, not just their own kind): with grid mode off, Figma-style alignment guides compare the moved object's near edge, far edge, and center (both axes) against those same three points on every other fixture/wall; within an 8-screen-pixel threshold (`GUIDE_THRESHOLD_PX`, converted to world units by the current zoom), it snaps and a green guide line is drawn at that coordinate (`computeAlignmentSnap`/`updateGuides` in `FixtureLayer.tsx`). With grid mode on, `computeSnap` instead does corner-to-corner magnet snapping against every other fixture/wall's corners first (within `FIXTURE_SNAP_WORLD_UNITS`), falling back to the plain grid when nothing's close enough. The guide lines are plain Konva refs updated directly, not React state, so dragging doesn't re-render anything. A wall resize uses a single-axis variant of the alignment-guide idea — only the one moving edge is compared, not all three points, since resizing only moves one edge at a time (grid-on resize is plain grid-snap, no corner magnet).

**Direct-Konva-mutation drag pattern**
Every drag interaction on the canvas (fixture move, wall move/resize, entrance slide/resize, perimeter thickness handle) mutates the Konva node directly frame-by-frame and only writes to the Zustand store once, on drag end. This keeps React re-renders out of the drag loop — writing to the store on every `dragmove` was the original cause of drift/jitter bugs early on.

**Products, CSV Import, and Auto-Linking**
`CSVImporter.tsx` is a three-step modal: upload (parse via `csvParser.ts`'s hand-rolled parser — no library dependency), map (`ColumnMapper.tsx`), summary (`ImportSummary.tsx`). Per CSV column, the retailer picks a target — one of 5 standard fields (`sku`/`itemName`/`price`/`category`/`locationCode`) or a **custom field** under whatever name they type — plus, independently, whether it's **Required** and/or **Shopper-visible**. This is why `ColumnMap`/`ShopperVisibility` (`types/index.ts`) are typed as `Partial<Record<string, ...>>` rather than keyed to the 5 standard names: a `Product` is `{ id, sku?, itemName, price?, category?, locationCode?, fixtureId?, shopperVisible, [key: string]: unknown }` — that catch-all is what lets a retailer's own field (e.g. Walmart's numeric "Department") live on the object under its own name with no schema change. A row missing a value for *any* Required field (Item Name always among them, locked in the UI) is skipped rather than imported as a broken product, and the importer reports the skipped count.

Auto-linking (`autoLinker.ts`'s `linkProductsToFixtures`) matches `product.locationCode` to `fixture.locationCode` and sets `fixtureId` on match — but it only runs at that moment. Placing or (re)coding a fixture *after* importing doesn't retroactively link anything by itself (a real gap found during testing) — `relinkAllProducts` re-runs the same matching against the canvas's current fixtures without touching anything else, wired to a **Relink** button in `ProductList.tsx` that appears whenever something's unlinked.

**Import is a full replace, by design** — `importProducts` (`productStore.ts`) always does `set({ products, columnMap, requiredFields })`, wholesale. Importing a second CSV, whether its columns match the first exactly or not at all, discards every existing product and starts fresh; there is no merge/append or update-by-key logic. This was a deliberate choice (confirmed with the founder) over a merge-by-key design, to avoid needing a defined unique key and conflict rules for a case that hasn't come up yet.

**Required and Shopper-visible are field-level settings, not per-product, and not import-locked** — `shopperVisible` is stored per-product (so it round-trips through save/load per-record), but `setFieldVisibility`/`setFieldRequired` always write across *every* product that has that field, because visibility/requiredness is conceptually a property of the field, not any one item. `ProductFieldSettings.tsx` reopens the exact same menu shown during import, anytime, from a "Fields" button in `ProductList.tsx` — toggling Required there never deletes existing data; it just surfaces a count of products currently missing that field.

**Product editing** — double-clicking a product in `ProductList.tsx` opens `ProductDetailModal.tsx`: standard fields as dedicated inputs, custom fields as an editable, addable/removable key-value list. Saving calls `updateProduct` (a *full replace* of the product's own fields, not a merge — otherwise removing a custom field in the editor wouldn't actually remove it) and immediately calls `relinkAllProducts`, so editing Location Code takes effect without a separate Relink click. Single-clicking a linked product instead calls `selectFixture` + zooms/centers the viewport on it (`highlightFixture` in `ProductList.tsx`, reusing `fitToStore`'s zoom-to-bounding-box math on a small margin around just that fixture) — same idea Shopper will eventually do with search results, just for the retailer's own use inside Builder. Centering alone isn't enough on a real store-sized layout (100+ m across): at whatever zoom the retailer was already at, a ~1m shelf is an invisible speck, so this always zooms in regardless of the starting zoom level.

**Save/Load (.ifp) and Export (datapackage.json) — both built, deliberately separate code paths**
File I/O is main-process-only: `registerFileHandlers` in `src/main/index.ts` registers `ipcMain.handle('project:save'/'project:open'/'export:save', ...)`, using native `dialog.showSaveDialog`/`showOpenDialog` and plain `fs/promises` read/write — the renderer never touches the filesystem directly. The renderer side is `utils/projectFile.ts` (`serializeProject` reads all three data stores — canvas, project, and product — into a `ProjectFile`; `hydrateProject` does the reverse via `projectStore.loadProject` + `canvasStore.loadCanvas` + `productStore.importProducts`) and `utils/fileActions.ts` (`saveProject`/`saveProjectAs`/`openProject`/`exportDataPackage`, which call the IPC handlers and show a plain `window.alert` on failure, an invalid file, or an error). `saveProject` resaves to `currentFilePath` if one exists; `saveProjectAs` and `exportDataPackage` always prompt, regardless — an export has no "current file" to quietly resave to, since it's a one-way snapshot, not something you reopen. `currentFilePath` (in `projectStore`) is set after a successful save-with-dialog or open, and reset to null by `initProject` (a brand-new project has nowhere to resave to yet). Loading discards undo/redo history and clears selection (`loadCanvas`), since both would reference a different project's state. `App.tsx` wires Ctrl+S/Ctrl+Shift+S/Ctrl+O directly (same pattern as the existing Ctrl+Z/Ctrl+Y) and extends the existing `menu:action` IPC channel for File > Save/Save As/Open/Export, mirroring how Edit > Undo/Redo already round-trip through the renderer.

`products`/`columnMap`/`requiredFields` were *not* included when `.ifp` save/load first shipped — `productStore` didn't exist yet at that point, and the omission wasn't caught until a retailer actually lost imported products across a save/reopen. Now that the mistake is on record: **any new field added to any store needs an explicit trip through `serializeProject`/`hydrateProject`/`isValidProjectFile`, or it silently doesn't survive a save.**

Export (`utils/exporter.ts`'s `buildDataPackage`) is a genuinely separate transform from save/load, not a filtered view of the same code path — `.ifp` needs to round-trip losslessly back into Builder; the data package never gets read by Builder again, only by Shopper, so it can (and does) drop everything Shopper has no use for: `customFixtureTypes`, `wallDefaults`, `columnMap`, `requiredFields`, undo history, every non-shopper-visible product field, and the `shopperVisible` map itself (once applied, Shopper doesn't need to know it existed). `stripProduct` keeps only `id`, `fixtureId` (needed to highlight the right fixture, even though it's not customer-facing text), and whichever fields are actually marked visible — an unchecked field is *absent* from the JSON, not `null` or empty.

---

## Shopper Architecture

A separate Vite + React + TypeScript project, in its own git repo (`aislez-shopper/`, sibling to `aislez-builder/` on disk, excluded from this repo via `.gitignore`) — deliberately disconnected from Builder's codebase; the only thing joining them is the `datapackage.json` contract. Not yet deployed (Netlify deploy + landing page is Phase 8); runs today via `npm run dev`.

### Folder Structure (current)
```
aislez-shopper/
├── public/
│   └── datapackage.json       # Static asset for local dev — the real deploy fetches whatever file is placed here (or wherever Builder's export lands)
├── src/
│   ├── App.tsx                 # Root: header/search, results panel, map
│   ├── types.ts                 # Hand-mirrored copy of Builder's DataPackage shape — separate repos, no shared module
│   ├── components/
│   │   ├── SearchBar.tsx        # Text input with a magnifying-glass icon
│   │   ├── SearchResults.tsx    # Matching products; empty/no-match states
│   │   ├── ItemCard.tsx         # Selected product: name, price, custom fields, location badge
│   │   └── StoreMap.tsx         # Canvas 2D map: outline/walls/entrances/fixtures, independent zoom/pan, blink-then-highlight
│   ├── hooks/
│   │   └── useDataPackage.ts    # fetch('/datapackage.json') once on mount
│   └── utils/
│       └── search.ts            # Filter by itemName/category, case-insensitive partial match
├── index.html
├── vite.config.ts
└── package.json
```

### Data Flow
```
Load datapackage.json (fetch, on mount)
        ↓
User types in the search bar
        ↓
searchProducts() filters by itemName/category (empty query → no results shown)
        ↓
SearchResults list renders matches
        ↓
User clicks a result
        ↓
Look up data.fixtures by the product's own fixtureId (not a re-match on locationCode —
auto-linking already happened in Builder; the id is already on the product)
        ↓
StoreMap blinks that fixture's border a few times, then holds a steady highlight
        ↓
ItemCard shows name, price, any other shopper-visible fields, and the location
(or "Not currently on the floor" if the product has no fixtureId)
```

### Map Rendering
Plain Canvas 2D — no Konva, no library; read-only, so none of Builder's drag machinery is needed. `StoreMap.tsx` fits the `storeOutline` polygon to its container, strokes the perimeter in `store.wallColor` while skipping any stretch covered by an `Entrance` (computed as gaps per edge, not a separate shape), fills interior `walls` as solid rects, and draws each fixture as a rect in its own baked-in `color` with its `locationCode` (falling back to `abbrev`) as a label. Fixture/wall `rotation` is always `0` in practice (Builder's rotate actions swap width/height instead of a real transform), so Shopper never handles rotated rects.

The map also has its own independent **scroll-to-zoom (centered on cursor) and drag-to-pan**, separate from the browser's page zoom — a page can't scope native browser zoom to one element, and relying on it would zoom the header/search bar too, which is the wrong UX. A small "Reset view" button appears once zoomed/panned away from the fitted default. This mirrors Builder's own canvas zoom/pan pattern, independently re-implemented since the two apps share no code.

### Why fixtureId, not a locationCode re-match
The original design sketch (pre-Phase-5) had Shopper re-deriving the fixture by matching `product.locationCode` against each fixture's own code at search time. Once Phase 5 added `autoLinker.ts`'s `fixtureId` directly onto each product, that became unnecessary — Builder has already done the matching once, correctly, and `fixtureId` ships straight through the export. Shopper just looks it up; it never needs to know what a location code even is.

---

## Mock Store Data

### Mock CSV (founder creates this manually)
```csv
SKU,ITEM_NAME,PRICE,CATEGORY,LOCATION_CODE
94823,Heinz Ketchup 500ml,3.99,Condiments,B3-1
94824,French's Mustard 250ml,2.99,Condiments,B3-2
94825,Hellmann's Mayonnaise,4.49,Condiments,B3-3
94826,Campbell's Tomato Soup,1.99,Canned Goods,C1-1
94827,Campbell's Chicken Noodle,1.99,Canned Goods,C1-2
94828,Kraft Peanut Butter 500g,5.49,Spreads,D2-1
94829,Smucker's Strawberry Jam,3.29,Spreads,D2-2
94830,Wonder Bread White,3.49,Bakery,E1-1
94831,Dempster's Whole Wheat,3.99,Bakery,E1-2
94832,Quaker Oats 1kg,4.99,Breakfast,F1-1
```

### Column Mapping for Mock CSV
```
SKU → sku
ITEM_NAME → itemName
PRICE → price
CATEGORY → category
LOCATION_CODE → locationCode
```

---

## What Connects Builder to Shopper in the Demo (planned)

For the Netlify demo:
1. Founder builds mock store in Builder, exports datapackage.json
2. datapackage.json is committed to the Shopper repo as a static file
3. Shopper loads it on startup
4. No server needed — fully static

For the real product:
1. Retailer exports datapackage.json from Builder
2. Saves it to their own server
3. Shopper (SDK/app/kiosk) fetches it from their server
4. No Aislez servers involved

---

*Last updated: September 2026*
