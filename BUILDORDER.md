# BUILDORDER.md — Aislez Build Order

> Follow this sequence exactly. Do not start a phase until the previous one is complete and working. Each phase ends with a testable result.

---

## Phase 1 — Builder: Canvas Foundation ✅ Complete

**Goal:** A working Electron app with a blank canvas where you can place fixtures and see them rendered.

### Steps
1. ✅ Set up Electron + React project with Vite
2. ✅ Install Konva.js
3. ✅ Render a blank canvas that fills the window
4. ✅ Add a grid layer (snap grid, toggleable — dots/lines/off)
5. ✅ Add a sidebar with a fixture library panel (list of fixture types, no drag yet)
6. ✅ Implement drag-from-sidebar → drop-on-canvas for a single fixture type (Shelf)
7. ✅ Render the placed fixture as a labeled rectangle on canvas
8. ✅ Make placed fixtures selectable (click to select, highlight border)
9. ✅ Make selected fixtures moveable (drag to reposition)
10. ✅ Make selected fixtures deleteable (Delete key)

**Test:** Open the app, drag a shelf onto the canvas, move it around, delete it.

---

## Phase 2 — Builder: Location Code System ✅ Complete

**Goal:** Fixtures have location codes that the retailer can assign and manage. Codes match CSV location codes for auto-linking.

> **Implementation note (July 2026):** Auto-generating codes from canvas X/Y position was de-scoped after discussion with the founder. Retailers use their own existing aisle/bay numbering schemes (e.g. Walmart Canada format), so auto-derivation from pixel position would conflict with real-world store layouts. Codes are instead **manually assigned** via the toolbar. The chain system auto-numbers chain members once a prefix is set.

### Steps
1. ✅ Add location code prefix + section number inputs to the toolbar (shown when a fixture or chain is selected)
2. ✅ Display location code as the primary label on the fixture rectangle; fall back to fixture type name when no code is set
3. ✅ Duplicate-code detection: toolbar warns in real time if the typed code conflicts with an existing fixture/chain; suggests the next available section
4. ✅ Chain auto-numbering: assign a prefix (e.g. `B3`) to the chain head → all members are numbered `B3-1, B3-2, …` sequentially
5. ✅ Add remaining fixture types to the library (Chiller, Bunker, End Cap, Side Kick, Pallet, Rack, Table, Bin)
6. ✅ Each fixture type renders with a distinct color and a 2-letter abbreviation (SH, CH, BK, EC, SK, PL, RK, TB, BN)

**Test:** Place 10 fixtures of mixed types. Type a code into the toolbar — it appears on the fixture. Place two chains and assign conflicting codes — the app warns. Move a fixture — its code stays with it.

---

## Phase 3 — Builder: Store Shape, Walls, Entrances & Canvas Tools ✅ Complete

**Goal:** Retailer can define the store's outline (rectangle or hand-drawn), place interior walls and entrances, and upload a floorplan image as a background reference.

> **Implementation note (July 2026):** This phase grew well past its original "draw a wall, connect segments into an outline" scope, based on founder feedback partway through (inspired by real architectural floor plans). The store's outer boundary and interior walls turned out to need genuinely different behavior, so they became two separate systems instead of one generic "wall" tool:
> - **Perimeter** = the store's own outer boundary. Defined once (rectangle at project creation, or hand-drawn), then rendered as a border band whose thickness grows **outward only** and is adjustable per side — so retailers can match a real blueprint's wall thickness without it ever eating into usable floor space. The boundary itself (independent of thickness) is what fixtures and interior walls are blocked from crossing. The sketch tool also rejects any segment that would retrace or cross the outline drawn so far, so it's impossible to end up with a self-intersecting (figure-eight) boundary.
> - **Interior walls** = retailer-placed dividers with real footprint that fixtures can't overlap. Dragged from the sidebar like a fixture, fully resizable/rotatable. Two walls that touch or overlap suppress their borders at the shared area too, so they read as one joined shape instead of two independently-outlined rectangles.
> - **Entrances** = openings hosted on a specific perimeter edge (can only slide/resize along that edge, never become free-standing), dragged from the sidebar and snapped to the nearest outline edge.
> - Where an interior wall butts up against the perimeter, both sides suppress their outline at the seam so the two read as one continuous wall instead of showing a joint.
> - **Floorplan image** = the drawn storeOutline defines scale, not the photo — retailers draw their outline with real measurements first, then upload a photo and drag a corner to stretch/reposition it until its own printed walls line up with the outline already on the canvas. Corner handles are locked to the image's own aspect ratio (no distorting it out of scale), and it can be rotated in 90° increments for photos taken sideways.

### Steps
1. ✅ Store shape picker in New Project dialog — Rectangle (enter width/height) or Custom (draw it after creating the project)
2. ✅ Perimeter sketch tool (Draw mode): click to place each corner, snapped perpendicular to the last segment, type an exact length, close the loop by clicking back near the start
3. ✅ Perimeter renders as a border band (inner edge = the true store boundary, outer edge = boundary + thickness); default thickness per side, individually adjustable by dragging a handle on a selected side or typing a value into the toolbar
4. ✅ Interior wall placement: drag from sidebar, move/resize/rotate, duplicate, always-outlined styling, seam-blended where flush against the perimeter or another wall
5. ✅ Entrances: drag from sidebar, snap to nearest perimeter edge, slide/resize along that edge, toolbar property panel
6. ✅ Fixtures and interior walls blocked from overlapping a wall or leaving the store's perimeter boundary
7. ✅ Floorplan image upload button (toolbar, next to the grid toggle)
8. ✅ Uploaded image renders as a background layer behind the grid/fixtures/walls
9. ✅ Image is scaleable (aspect-locked corner drag), repositionable (drag), and rotatable (90° increments); opacity slider down to fully invisible, Remove button
10. ✅ Arrow-extend: directional arrow buttons on a selected fixture extend the chain one unit; new member is auto-numbered

> **Extra features added during Phase 3 (all founder-confirmed):** chain system (fixtures link into doubly-linked rows), multi-select (rubber-band + Ctrl+click + Ctrl+dblclick for chain), group move/rotate/duplicate/delete, smart alignment guides (Figma-style, grid-off — plus grid-on corner-to-corner magnet snapping, both now cross-type between fixtures and walls), Duplicate (Ctrl+D), full undo/redo history across fixtures/walls/entrances.

> **Correction (September 2026):** step 6 above was marked done in July but only ever applied to fixtures — walls had zero collision enforcement (could freely overlap other walls/fixtures or leave the perimeter) until now. Fixed properly this pass: `wallPlacementBlocked` checks every move/resize drag frame (not just on drop), so a blocked wall sticks at the last valid spot instead of passing through and rubber-banding back on release. Also fixed in this pass: entrance rendering (opening now spans the full host wall thickness instead of a thin line; a plain click now selects one, not just a drag), a wall border rendering artifact (small overshoot "dots" at a free-standing wall's own corners), and an antialiasing seam between two flush interior walls' fills.

**Test:** Create a store with a custom-drawn outline, adjust one side's thickness, place an interior wall flush against that side and confirm the seam disappears, add an entrance on another side, place fixtures and confirm they can't cross the perimeter or overlap the wall. Upload a floorplan photo, drag it into alignment with the outline, rotate it 90°, and fade it to invisible with the opacity slider. Additionally: drag a wall into another wall/fixture and confirm it stops at contact in both grid modes; drag a fixture or wall near the other type and confirm magnet/alignment snapping engages.

---

## Phase 4 — Builder: Save and Load ✅ Complete

**Goal:** Retailer can save their work as a .ifp file and reopen it later.

> **Implementation note (September 2026):** File I/O lives in the Electron main process (`ipcMain.handle('project:save'/'project:open')` in `src/main/index.ts`, using native save/open dialogs), not a separate `fileManager.js` — the renderer collects/parses the JSON (`utils/projectFile.ts`'s `serializeProject`/`hydrateProject`) and calls `utils/fileActions.ts`'s `saveProject`/`openProject`, which invoke those IPC handlers. `ProjectFile` (`types/index.ts`) was rewritten to match the real `Wall`/`Entrance`/`ProjectSettings` shapes — the original sketch predated all of Phase 3 and only had `store: {name,width,height}` + fixtures. Ctrl+S resaves straight to the last-used path (tracked in `projectStore.currentFilePath`, reset to null on `initProject`); only the first save (or a file that's never been saved) prompts a dialog. Loading clears undo/redo history and selection (`canvasStore.loadCanvas`) since neither makes sense against a different project's state.

### Steps
1. ✅ canvasStore/projectStore/uiStore already exist from earlier phases — CSV/product data will need a new store (or an extension of an existing one) once Phase 5 starts
2. ✅ File save/load IPC handlers in the Electron main process
   - `project:save`: renderer serializes state to JSON → main shows a save dialog (skipped on resave) → writes the `.ifp` file
   - `project:open`: main shows an open dialog → reads the file → renderer validates and hydrates all stores
3. ✅ Add Save button to toolbar (Ctrl+S shortcut, plus File menu)
4. ✅ Add Open button to toolbar (Ctrl+O shortcut, plus File menu)
5. ✅ On app launch: show a start screen — "New Project" or "Open Project" (`StartScreen.tsx`)
6. ✅ Test that reopening a .ifp file restores the exact canvas state — founder-verified: built a store using every feature, saved, reopened, everything present

**Test:** Build a small store, save as .ifp, close the app, reopen the file, everything is restored.

---

## Phase 5 — Builder: CSV Import ✅ Complete

**Goal:** Retailer can upload a CSV, map columns, and have products appear in the app.

> **Implementation note (September 2026):** Grew past the original "map to 5 fixed fields" scope, based on founder feedback partway through — real retailers don't share one schema (Walmart's "Department" is a number, not a text category; some CSVs carry inventory/margin data that must never reach a shopper). So the mapper doesn't force every column into `sku`/`itemName`/`price`/`category`/`locationCode` — any column can instead become a **custom field** under whatever name the retailer types, and every mapped column (standard or custom) independently gets **Required** and **Shopper-visible** checkboxes, not just a single global toggle. `Product`'s existing catch-all index signature (`[key: string]: unknown`) is what makes this work with no schema change. Required/Shopper-visible turned out to be *field-level* settings that make sense to revisit after import too — not one-time import decisions — so they're reopenable anytime via a "Fields" button, not locked to the import wizard. See [ARCHITECTURE.md](ARCHITECTURE.md)'s "Products, CSV Import, and Auto-Linking" section for the full design.

### Steps
1. ✅ Add Import button to toolbar (+ File menu, Ctrl+S/O parity)
2. ✅ Build CSVImporter.tsx modal — file upload, preview rows
3. ✅ Write csvParser.ts — hand-rolled parser (quoted fields, embedded commas/newlines, CRLF/LF), no library needed
4. ✅ Build ColumnMapper.tsx — per column: target field (standard **or custom-named**), Required, Shopper-visible, live preview table
5. ✅ On confirm mapping → import all rows into productStore (rows missing a Required field are skipped, not imported broken)
6. ✅ Build ImportSummary.tsx — imported / linked / unlinked / skipped counts
7. ✅ Write autoLinker.ts:
   - After import, loop through products
   - Match product.locationCode to fixture.locationCode
   - Set product.fixtureId where match found
   - Flag unmatched products
   - **Extra:** Relink action to re-run this anytime (placing/coding a fixture *after* import doesn't link retroactively on its own — found during testing)
8. ✅ Build ProductList.tsx in sidebar — show all imported products, linked ones show their fixture code, unlinked ones show a warning
   - **Extra:** click a linked product to highlight + center its fixture on the canvas; double-click to open a full detail editor (all fields, including custom ones, plus delete); a Fields button reopens the Required/Shopper-visible menu anytime, not just at import
9. ✅ Add shopper-visible toggle per field in ColumnMapper step (generalized to every field, standard or custom, and persisted independent of any one import)

**Test:** Import the mock CSV. All products appear. Products with matching location codes show as linked to their fixtures. Additionally: import a CSV with a non-standard column (e.g. a numeric "Department"), keep it as a custom field, and confirm it displays and can be toggled shopper-visible; place a fixture *after* importing an item coded for it and confirm Relink picks it up; double-click a product, edit its Location Code to match a different fixture, and confirm it re-links on save; save the project, reopen it, and confirm every imported product (and its field settings) is still there.

---

## Phase 6 — Builder: Export

**Goal:** Builder exports a JSON data package that Shopper can load.

### Steps
1. Write exporter.js utility
   - Takes current canvasStore + productStore state
   - Strips internal-only fields based on shopperVisible toggles
   - Builds the JSON data package structure
   - Returns clean JSON object
2. Add Export button to toolbar
3. On export → run exporter.js → write JSON file via Electron file system API
4. Show success message with file path

**Test:** Build mock store, import mock CSV, export JSON. Open the JSON file and verify it contains fixtures and products with correct structure.

---

## Phase 7 — Shopper: Map + Search

**Goal:** A browser app that loads the JSON data package and lets users search for products.

### Steps
1. Create new React project (separate repo, deploys to Netlify)
2. Add the exported mock store datapackage.json as a static file in /public
3. Write useDataPackage.js hook — load and parse the JSON on startup
4. Render the store map:
   - Draw each fixture as a labeled rectangle at its x/y/width/height coordinates
   - Use plain Canvas API or SVG (no Konva needed — read only)
   - Each fixture type gets a distinct color matching Builder
5. Build SearchBar.jsx — text input, searches as user types
6. Write search.js utility — filter products by itemName and category (case insensitive, partial match)
7. Build SearchResults.jsx — list of matching products showing name, price, location code
8. On result click:
   - Find fixture with matching locationCode
   - Apply blinking CSS animation to that fixture on the map
   - Show ItemCard with name, price, location code

**Test:** Open Shopper in browser, search "ketchup", result appears, click it, fixture blinks on map.

---

## Phase 8 — Demo Polish

**Goal:** The Netlify demo is clean, impressive, and self-explanatory to a recruiter.

### Steps
1. Build a landing page with two clear buttons: "Store Builder Demo" and "Shopper Demo"
   - Builder Demo: short video or GIF showing Builder in action (screen recording)
   - Shopper Demo: links to the live Shopper browser app
2. Add a brief explanation on the landing page (2-3 sentences max, no jargon)
3. Polish Shopper UI — clean typography, clear map, obvious search bar
4. Add a "How to use" tooltip or onboarding hint in Shopper (first time only)
5. Ensure Shopper works on mobile screen sizes
6. Deploy to Netlify

**Test:** Send the Netlify link to someone unfamiliar with the project. They should understand what it does and be able to find a product within 30 seconds.

---

## Phase 9 — GitHub Repo Polish

**Goal:** The GitHub repo looks professional to an internship recruiter.

### Steps
1. Write README.md covering:
   - What the problem is (1 paragraph)
   - What Aislez does (1 paragraph)
   - Screenshots of Builder and Shopper
   - Tech stack
   - How to run locally (Builder and Shopper separately)
   - Link to live Netlify demo
2. Clean up all console.logs and debug code
3. Ensure consistent code style throughout
4. Write brief comments on non-obvious logic (location code generation, auto-linking)
5. Add a LICENSE file (MIT)

---

## What Is Explicitly Out of Scope (Do Not Build)

- Direct database connection (CSV only for v1)
- User authentication or login
- Real-time sync between Builder and Shopper
- Walking route / pathfinding (kiosk routing is v2)
- Barcode scanning
- 3D shelf viewer
- Mobile app
- Cloud hosting or any server infrastructure

---

*Last updated: September 2026*
