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

**Goal:** Every placed fixture automatically gets a unique location code. Codes update intelligently.

### Steps
1. Write locationCode.js utility
   - Takes fixture's x/y position on canvas
   - Returns a code in format `[Aisle][Bay]-[Section]`
   - Aisle = letter derived from X zone (A, B, C...)
   - Bay = number derived from position within aisle
   - Section = order of placement in that bay
2. On fixture drop → auto-assign location code
3. Display location code as a label on the fixture rectangle
4. On fixture move → recalculate and update location code
5. Ensure no two fixtures share the same code (auto-increment section)
6. Add remaining fixture types to the library (Chiller, Bunker, End Cap, Side Kick, Pallet, Rack, Table, Bin)
7. Each fixture type renders with a distinct color so they're visually distinguishable

**Test:** Place 10 fixtures of mixed types. Every one has a unique location code. Move one — code updates.

---

## Phase 3 — Builder: Canvas Tools

**Goal:** Retailer can draw store walls and upload a floorplan image as a background reference.

### Steps
1. Add wall drawing tool to toolbar (toggle between Select mode and Draw mode)
2. In Draw mode: click to start wall, click again to end wall segment, renders as a line
3. Connect wall segments to form a store outline
4. Add floorplan image upload button
5. Render uploaded image as a background layer behind fixtures (non-interactive)
6. Image should be scaleable and repositionable
7. Add arrow-extend feature: select a fixture row, extend arrow adds a new fixture at the end with auto-incremented code

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
