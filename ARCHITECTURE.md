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
│  Save: project.ifp   [planned]  │
│  Export: datapackage.json [planned] │
└──────────────┬──────────────────┘
               │ datapackage.json
               ▼
┌─────────────────────────────────┐
│           SHOPPER               │
│      (React Browser App)        │
│         [not started]           │
│                                 │
│  Load JSON → Render Map →       │
│  Search → Highlight Fixture     │
└─────────────────────────────────┘
```

Builder is the only application that currently exists and runs. Shopper, the .ifp save/load format, and the exported JSON data package are all still design targets — see [What's Actually Built vs Planned](#whats-actually-built-vs-planned) below before trusting any section as current behavior.

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
| Save/load `.ifp` project file | ⬜ Planned |
| CSV import + column mapping + auto-linking | ⬜ Planned |
| Product list sidebar | ⬜ Planned |
| Export JSON data package | ⬜ Planned |
| Shopper app (any part of it) | ⬜ Not started |

The rest of this document describes the built parts as they actually work, and the planned parts as design intent (clearly marked). See [BUILDORDER.md](BUILDORDER.md) for phase-by-phase sequencing.

---

## File Formats — Planned

Neither format below is wired up yet: `types/index.ts` sketches out the shapes (`ProjectFile`, `DataPackage`, `Product`), but there is no save, load, import, or export code anywhere in the app. This is the design target for Phases 4–6.

### .ifp Project File (Builder will save this)
The full editable project. JSON under the hood, renamed .ifp.

```json
{
  "version": "1.0",
  "store": {
    "name": "Mock Walmart - Section B",
    "width": 1200,
    "height": 800,
    "backgroundImage": "base64_encoded_floorplan_or_null"
  },
  "fixtures": [
    {
      "id": "fixture_001",
      "type": "shelf",
      "locationCode": "B3-1",
      "x": 120,
      "y": 200,
      "width": 80,
      "height": 20,
      "rotation": 0,
      "label": "B3-1"
    }
  ],
  "products": [
    {
      "sku": "94823",
      "itemName": "Heinz Ketchup 500ml",
      "price": 3.99,
      "category": "Condiments",
      "locationCode": "B3-1",
      "shopperVisible": {
        "itemName": true,
        "price": true,
        "sku": false
      }
    }
  ],
  "columnMap": {
    "WM_ITEM_NUMBER": "sku",
    "SHORT_DESC": "itemName",
    "SHELF_PRICE": "price",
    "LOCATION_CODE": "locationCode"
  }
}
```

Note: the actual `Wall` and `Entrance` shapes that exist today (see Key Logic below) aren't reflected in this sketch yet — this format needs a pass once save/load is actually built.

### JSON Data Package (Shopper will load this)
Exported from Builder. Shopper-facing only — no internal fields.

```json
{
  "version": "1.0",
  "store": {
    "name": "Mock Walmart - Section B",
    "width": 1200,
    "height": 800
  },
  "fixtures": [
    {
      "id": "fixture_001",
      "type": "shelf",
      "locationCode": "B3-1",
      "x": 120,
      "y": 200,
      "width": 80,
      "height": 20,
      "rotation": 0
    }
  ],
  "products": [
    {
      "itemName": "Heinz Ketchup 500ml",
      "price": 3.99,
      "category": "Condiments",
      "locationCode": "B3-1"
    }
  ]
}
```

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
│   │   └── index.ts                 # Electron main process, window, native menu (Undo/Redo/Delete via IPC)
│   ├── preload/
│   │   └── index.ts                 # Electron preload (context bridge)
│   └── renderer/src/
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Root layout + Toolbar (contextual property panels per selection type)
│       ├── types/
│       │   └── index.ts             # Fixture, Wall, Entrance, ProjectSettings + [planned] Product/file-format shapes
│       ├── components/
│       │   ├── Canvas/
│       │   │   ├── StoreCanvas.tsx        # Konva Stage, zoom/pan, rubber-band select, drop handler
│       │   │   ├── FixtureLayer.tsx       # Fixture rendering, chain groups, multi-select, alignment guides
│       │   │   ├── WallLayer.tsx          # Interior walls: move/resize, outline, perimeter seam blending
│       │   │   ├── EntranceLayer.tsx      # Entrances hosted on storeOutline edges: slide/resize
│       │   │   ├── PerimeterWallLayer.tsx # Store perimeter as an outward-thickened border band
│       │   │   ├── PerimeterDrawLayer.tsx # Perimeter sketch tool (Draw mode) — click corners, perpendicular snap
│       │   │   ├── ArrowLayer.tsx         # Arrow-extend buttons for chain rows
│       │   │   ├── GridLayer.tsx          # Dot/line grid
│       │   │   ├── Ruler.tsx              # Horizontal + vertical rulers
│       │   │   └── BackgroundLayer.tsx    # Floorplan reference photo — scale/reposition/rotate, renders bottommost
│       │   ├── Sidebar/
│       │   │   ├── FixtureLibrary.tsx     # Drag-to-canvas palette: Wall, Entrance, built-in + custom fixtures
│       │   │   └── ProductList.tsx        # [planned] Linked product list
│       │   ├── NewProjectDialog.tsx       # New project setup: name, unit, rectangle/custom shape, grid snap
│       │   ├── ProjectSettingsModal.tsx   # Edit project settings at any time
│       │   └── Import/                    # [planned] CSV import flow
│       ├── store/
│       │   ├── canvasStore.ts       # Fixtures, walls, entrances, selection, undo/redo history, chain ops
│       │   ├── projectStore.ts      # Project settings (unit, store outline, per-edge perimeter thickness, grid snap, background image), custom fixture types, wall defaults
│       │   └── uiStore.ts           # Zoom/pan/viewport, active tool, grid mode, Ctrl-held tracking, tooltip
│       └── utils/
│           ├── chain.ts             # Chain traversal, code parsing, direction logic
│           ├── chainState.ts        # Chain state helpers
│           ├── geometry.ts          # Polygon/rect math: containment, outward offset, edge projection, wall↔perimeter/wall↔wall flush detection, self-intersection check
│           └── locationCode.ts      # Location code utilities
├── electron.vite.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json  # Solution-style — typecheck via `npm run typecheck`, not `tsc --noEmit`
└── package.json
```

### State Management
**Zustand**, three stores (there is no `productStore` — product/CSV data doesn't exist yet; it will need a new store or an extension of one of these once Phase 5 starts):

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

**uiStore** — owns:
- Zoom, pan, stage dimensions, active tool (`select` | `draw`), grid mode (`dots` | `lines` | `off`), tooltip, Ctrl-held tracking (for canvas panning)

### Key Logic

**Store perimeter vs. interior walls — two distinct concepts**
`storeOutline` (a closed, axis-aligned polygon in `projectStore`) is the *only* thing that defines the interior boundary — it's what `rectInsidePolygon` checks fixtures and walls against, and it never changes shape when perimeter thickness changes. The perimeter is rendered as a border band that grows **outward only** from that polygon, by a thickness that's adjustable per edge (hold-drag the handle on a selected side — deliberately built on raw `window` mouse listeners rather than Konva's own drag system, so it can never get stuck following the cursor after release — or type a value into the toolbar's PERIMETER panel). The sketch tool that draws `storeOutline` (`PerimeterDrawLayer.tsx`, `geometry.ts`'s `wouldSegmentSelfIntersect`) rejects any new segment that would retrace an earlier one (same line, overlapping range) or cross a non-adjacent one — the preview line and length label turn red and the click/Enter is silently ignored, so a hand-drawn outline can never end up self-intersecting. Interior walls are a completely separate `Wall` entity — placed from the sidebar, always solid, real footprint that blocks fixture placement. Walls are visually unified wherever they touch *anything* — the perimeter (`isWallSideFlushWithOutline`) or another wall (`wallSideTouchesOtherWalls`): a side touching either suppresses its own border, and on the perimeter side the perimeter's inner border is suppressed too, with a same-color patch to hide the antialiasing seam that would otherwise show between two separately-rendered fills of the same color. The wall-vs-wall check is whole-side (not partial-interval) — a side touching another wall along only part of its length loses its border for the whole side, a deliberate simplification.

**Entrances are hosted objects, not free-standing**
An `Entrance` doesn't have its own x/y — its geometry is entirely derived from `edgeIndex` (which storeOutline edge it's on) plus `offset`/`width` along that edge. It can only slide or resize along its host edge. Dropping the sidebar item snaps to whichever outline edge is nearest, within a threshold.

**Floorplan background image — the outline defines scale, not the photo**
A photo has no idea what "1 meter" means; `storeOutline` (drawn with real, typed measurements) does. So instead of a calibration tool, the retailer draws the outline first, then uploads a photo (`BackgroundImage` in `projectStore`, base64 + world-unit x/y/width/height/rotation/opacity) and drags a corner to stretch/reposition it until its own printed walls line up with the outline already on the canvas. Resize is corner-only and always uniform-scaled from the corner-to-corner diagonal distance, so it's impossible to stretch the image out of its own proportions once it's aligned. Rotation is 90°-increment only: `rotateBackgroundImage` swaps width/height and keeps the box's center fixed, while `BackgroundLayer.tsx` pre-swaps the *image's own* width/height and pivots it on its own center (via `offsetX`/`offsetY`) so the rotated content still exactly fills that same box — the resize handles always operate on the plain unrotated box and never need to know rotation happened. Renders bottommost (behind the grid and everything else); opacity goes to 0 (fully invisible).

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

**Alignment guides**
Figma-style snapping, active only when grid mode is off (grid-on uses corner/grid snapping instead — the two are mutually exclusive, not layered). While dragging, the moved object's near edge, far edge, and center (both axes) are compared against the same three points on every other fixture/wall; within an 8-screen-pixel threshold (`GUIDE_THRESHOLD_PX`, converted to world units by the current zoom), it snaps and a green guide line is drawn at that coordinate. The guide lines are plain Konva refs updated directly (`updateGuides` in `FixtureLayer.tsx`), not React state, so dragging doesn't re-render anything. A wall resize uses a single-axis variant of the same idea — only the one moving edge is compared, not all three points, since resizing only moves one edge at a time.

**Direct-Konva-mutation drag pattern**
Every drag interaction on the canvas (fixture move, wall move/resize, entrance slide/resize, perimeter thickness handle) mutates the Konva node directly frame-by-frame and only writes to the Zustand store once, on drag end. This keeps React re-renders out of the drag loop — writing to the store on every `dragmove` was the original cause of drift/jitter bugs early on.

**Auto-Linking — planned, not built**
Design intent once CSV import exists: after import, match each product's `locationCode` to a fixture's `locationCode`, set `product.fixtureId` on match, flag unmatched products in the UI.

**Export / Save / Load — planned, not built**
Design intent: `exporter` strips internal-only fields per `shopperVisible` toggles and writes the JSON data package; `.ifp` save/load serializes/hydrates all three Zustand stores. Neither exists yet — there's no File > Save/Open in the app menu today (see `src/main/index.ts`).

---

## Shopper Architecture — Not Started

Nothing below exists yet — no `aislez-shopper` directory, no code. This section is the design target for Phase 7, kept here so the plan doesn't get lost, not a description of anything running today.

### Folder Structure (planned)
```
aislez-shopper/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx                  # Root, loads data package
│   ├── components/
│   │   ├── SearchBar.jsx        # Item search input
│   │   ├── SearchResults.jsx    # List of matching products
│   │   ├── StoreMap.jsx         # Renders store map from JSON
│   │   ├── FixtureHighlight.jsx # Blink/highlight selected fixture
│   │   └── ItemCard.jsx         # Shows item name, price, location
│   ├── hooks/
│   │   ├── useSearch.js         # Filter products by query
│   │   └── useDataPackage.js    # Load and parse JSON data package
│   └── utils/
│       └── search.js            # Search logic (name, category match)
├── package.json
└── netlify.toml
```

### Data Flow in Shopper (planned)
```
Load datapackage.json
        ↓
Parse fixtures + products into memory
        ↓
User types search query
        ↓
Filter products by name / category match
        ↓
Show results list
        ↓
User selects a product
        ↓
Find fixture with matching locationCode
        ↓
Highlight + blink that fixture on the map
        ↓
Show ItemCard (name, price, location code)
```

### Map Rendering (planned)
- Store map is drawn using the fixtures array from the JSON package
- Each fixture rendered as a rectangle (or shape) at its x/y/width/height coordinates
- Use React + plain Canvas API (no Konva needed in Shopper — read only, no dragging)
- On item select: apply blinking CSS animation to the matching fixture element

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

*Last updated: July 2026*
