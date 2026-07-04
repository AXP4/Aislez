# BUILDORDER.md — Aislez Build Order

> Follow this sequence exactly. Do not start a phase until the previous one is complete and working. Each phase ends with a testable result.

---

## Phase 1 — Builder: Canvas Foundation

**Goal:** A working Electron app with a blank canvas where you can place fixtures and see them rendered.

### Steps
1. Set up Electron + React project with Vite
2. Install Konva.js
3. Render a blank canvas that fills the window
4. Add a grid layer (snap grid, toggleable)
5. Add a sidebar with a fixture library panel (list of fixture types, no drag yet)
6. Implement drag-from-sidebar → drop-on-canvas for a single fixture type (Shelf)
7. Render the placed fixture as a labeled rectangle on canvas
8. Make placed fixtures selectable (click to select, highlight border)
9. Make selected fixtures moveable (drag to reposition)
10. Make selected fixtures deleteable (Delete key)

**Test:** Open the app, drag a shelf onto the canvas, move it around, delete it.

---

## Phase 2 — Builder: Location Code System

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

## Phase 3 — Builder: Canvas Tools

**Goal:** Retailer can draw store walls and upload a floorplan image as a background reference.

### Steps
1. ⬜ Add wall drawing tool to toolbar (toggle between Select mode and Draw mode)
2. ⬜ In Draw mode: click to start wall, click again to end wall segment, renders as a line
3. ⬜ Connect wall segments to form a store outline
4. ⬜ Add floorplan image upload button
5. ⬜ Render uploaded image as a background layer behind fixtures (non-interactive)
6. ⬜ Image should be scaleable and repositionable
7. ✅ Arrow-extend: directional arrow buttons on a selected fixture extend the chain one unit; new member is auto-numbered

> **Extra features added during Phase 3 (all founder-confirmed):** chain system (fixtures link into doubly-linked rows), multi-select (rubber-band + Ctrl+click + Ctrl+dblclick for chain), group move/rotate/duplicate/delete, smart alignment guides (Figma-style, grid-off only), Duplicate (Ctrl+D).

**Test:** Upload a floorplan image, draw walls over it, place fixtures on top, extend a shelf row.

---

## Phase 4 — Builder: Save and Load

**Goal:** Retailer can save their work as a .ifp file and reopen it later.

### Steps
1. Implement Zustand stores (canvasStore, productStore, uiStore) if not already done
2. Write fileManager.js in Electron main process
   - saveProject(): serialize all store state → write as .ifp file (JSON)
   - loadProject(): read .ifp file → parse → hydrate all stores
3. Add Save button to toolbar (Ctrl+S shortcut)
4. Add Open button to toolbar
5. On app launch: show a start screen — "New Project" or "Open Project"
6. Test that reopening a .ifp file restores the exact canvas state

**Test:** Build a small store, save as .ifp, close the app, reopen the file, everything is restored.

---

## Phase 5 — Builder: CSV Import

**Goal:** Retailer can upload a CSV, map columns, and have products appear in the app.

### Steps
1. Add Import button to toolbar
2. Build CSVImporter.jsx modal — file upload, preview first 5 rows of CSV
3. Write csvParser.js — parse CSV into array of row objects
4. Build ColumnMapper.jsx — show their column names, dropdown to map each to standard fields (sku, itemName, price, category, locationCode)
5. On confirm mapping → import all rows into productStore
6. Build ImportSummary.jsx — show how many products imported, how many linked, how many unlinked
7. Write autoLinker.js:
   - After import, loop through products
   - Match product.locationCode to fixture.locationCode
   - Set product.fixtureId where match found
   - Flag unmatched products
8. Build ProductList.jsx in sidebar — show all imported products, linked ones show their fixture code, unlinked ones show a warning
9. Add shopper-visible toggle per field in ColumnMapper step

**Test:** Import the mock CSV. All products appear. Products with matching location codes show as linked to their fixtures.

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

*Last updated: June 2026*
