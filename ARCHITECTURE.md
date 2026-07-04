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

---

## File Formats

### .ifp Project File (Builder saves this)
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

### JSON Data Package (Shopper loads this)
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

### Folder Structure (current — July 2026)

Files marked `[planned]` are not yet implemented.

```
aislez-builder/
├── scripts/
│   └── dev.js                   # Clears ELECTRON_RUN_AS_NODE before launch
├── src/
│   ├── main/
│   │   └── index.ts             # Electron main process, window creation, menu
│   ├── preload/
│   │   └── index.ts             # Electron preload (context bridge)
│   └── renderer/src/
│       ├── main.tsx             # React entry point
│       ├── App.tsx              # Root layout + Toolbar component
│       ├── types/
│       │   └── index.ts         # Fixture, FixtureType, Unit types
│       ├── components/
│       │   ├── Canvas/
│       │   │   ├── StoreCanvas.tsx      # Konva Stage, zoom/pan, rubber-band, drop handler
│       │   │   ├── FixtureLayer.tsx     # All fixture rendering, chain groups, multi-select
│       │   │   ├── ArrowLayer.tsx       # Arrow-extend buttons (rendered in SVG layer)
│       │   │   ├── GridLayer.tsx        # Dot/line grid
│       │   │   ├── Ruler.tsx            # Horizontal + vertical rulers
│       │   │   ├── WallLayer.tsx        # [planned] Store outline / walls
│       │   │   └── BackgroundLayer.tsx  # [planned] Floorplan image underlay
│       │   ├── Sidebar/
│       │   │   ├── FixtureLibrary.tsx   # Drag-to-canvas fixture palette
│       │   │   └── ProductList.tsx      # [planned] Linked product list
│       │   ├── NewProjectDialog.tsx     # New project setup (name, unit, size)
│       │   ├── ProjectSettingsModal.tsx # Edit project settings at any time
│       │   └── Import/                  # [planned] CSV import flow
│       ├── store/
│       │   ├── canvasStore.ts   # Fixtures, selection, history, chain ops, multi-select
│       │   ├── projectStore.ts  # Project settings (unit, store size, grid snap)
│       │   └── uiStore.ts       # Zoom, pan, grid mode, Ctrl key, tooltip
│       └── utils/
│           ├── chain.ts         # Chain traversal, code parsing, direction logic
│           ├── chainState.ts    # Chain state helpers
│           └── locationCode.ts  # Location code utilities
├── electron.vite.config.ts
└── package.json
```

### State Management
Use **Zustand** for global state. Three stores:

**canvasStore** — owns:
- List of all fixtures (id, type, position, size, locationCode)
- List of walls / store outline paths
- Background image (base64)
- Canvas zoom and pan position
- Currently selected fixture id

**productStore** — owns:
- List of all products (sku, itemName, price, locationCode, shopperVisible fields)
- Column map (their column names → our standard fields)
- Import status (idle, importing, done, error)

**uiStore** — owns:
- Active tool (select, draw wall, place fixture)
- Active modal (import, export, properties)
- Sidebar tab

### Key Logic

**Location Code Auto-Generation**
When a fixture is placed on canvas:
1. Determine aisle from X position on canvas
2. Determine bay from position within aisle
3. Determine section from order placed in that bay
4. Generate code: `[Aisle][Bay]-[Section]` → `B3-1`
5. Check for duplicates, increment section if needed

**Auto-Linking**
When CSV import completes:
1. Loop through every imported product
2. Read its locationCode field (after column mapping)
3. Search fixtures array for matching locationCode
4. If found → set product.fixtureId = fixture.id
5. If not found → product stays unlinked (shown in UI as warning)

**Export Logic**
1. Take current canvasStore and productStore state
2. Filter products to shopper-visible fields only
3. Build JSON data package object
4. Write to file via Electron's file system API

**Save / Load .ifp**
- Save: serialize full state (canvas + products + columnMap) → write as .ifp
- Load: read .ifp → parse JSON → hydrate all three Zustand stores

---

## Shopper Architecture

### Folder Structure
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

### Data Flow in Shopper
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

### Map Rendering
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

## What Connects Builder to Shopper in the Demo

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
