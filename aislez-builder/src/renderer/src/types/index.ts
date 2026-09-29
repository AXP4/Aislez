// ─── Project / unit system ───────────────────────────────────────────────────

export type Unit = 'meters' | 'feet'

export interface ProjectSettings {
  name: string
  unit: Unit
  /** Store width in the chosen unit — bounding box of storeOutline */
  storeWidth: number
  /** Store height in the chosen unit — bounding box of storeOutline */
  storeHeight: number
  /** Snap increment in the chosen unit (0.01 – 1.0) */
  gridSnap: number
  /** Closed polygon (world units) tracing the store footprint — just a reference outline, not wall geometry */
  storeOutline: { x: number; y: number }[]
  /**
   * Wall thickness for each edge of storeOutline (parallel array, one entry
   * per edge). Grows outward only — the polygon above always stays the true
   * interior boundary used for fixture/wall containment.
   */
  perimeterThickness: number[]
  /** Floorplan reference image, or null if none uploaded */
  backgroundImage: BackgroundImage | null
}

/**
 * A retailer-uploaded floorplan photo, positioned/scaled to match the
 * already-drawn (correctly-scaled) storeOutline — the outline is the source
 * of truth for scale, not the image. Purely a tracing reference; never
 * affects containment or export.
 */
export interface BackgroundImage {
  /** Base64 data URL (e.g. "data:image/png;base64,...") */
  data: string
  /** Native pixel dimensions of the source file, used to keep resize proportional */
  naturalWidth: number
  naturalHeight: number
  /** Placement in world units */
  x: number
  y: number
  width: number
  height: number
  opacity: number
  /** 90° increments only: 0, 90, 180, or 270 */
  rotation: number
}

// ─── Fixture ─────────────────────────────────────────────────────────────────

export type FixtureType =
  | 'shelf'
  | 'chiller'
  | 'bunker'
  | 'endcap'
  | 'sidekick'
  | 'pallet'
  | 'rack'
  | 'table'
  | 'bin'
  | 'custom'

export interface CustomFixtureType {
  id: string
  name: string
  width: number
  height: number
  color: string
  abbrev: string
}

export interface Fixture {
  id: string
  type: FixtureType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Display label shown on the canvas rectangle */
  label: string
  /** Manually assigned in Phase 2+: e.g. "B3-1" */
  locationCode?: string
  /** Chain doubly-linked list: ID of the fixture before this one */
  prevId?: string
  /** Chain doubly-linked list: ID of the fixture after this one */
  nextId?: string
  /** Set when type === 'custom'; references a CustomFixtureType in projectStore */
  customTypeId?: string
}

export interface Wall {
  id: string
  x: number
  y: number
  width: number   // length of the wall
  height: number  // thickness of the wall
  rotation: number
}

export const WALL_COLOR = '#2c3e50'

/**
 * A doorway hosted on a segment of the store's perimeter outline — not a
 * free object. Position and size are expressed along that one edge, so it
 * can only slide and resize along that edge, never leave it.
 */
export interface Entrance {
  id: string
  /** Index into settings.storeOutline — the edge runs from outline[edgeIndex] to outline[edgeIndex+1] */
  edgeIndex: number
  /** Distance from the edge's start point (outline[edgeIndex]), along the edge */
  offset: number
  /** Opening width, along the edge */
  width: number
}

// ─── Product ─────────────────────────────────────────────────────────────────

/** Standard column names with dedicated meaning to the app (locationCode drives auto-linking, etc.) */
export type ColumnKey = 'sku' | 'itemName' | 'price' | 'category' | 'locationCode'

/**
 * Maps the retailer's CSV column header → a product field name. Usually one
 * of the standard ColumnKeys, but can be any retailer-chosen name for a
 * column that doesn't fit the standard set (e.g. "Department", "Backroom
 * Qty") — stored on Product via its catch-all index signature.
 */
export type ColumnMap = Partial<Record<string, string>>

/** Per-field: whether it's exported to Shopper. Keyed the same as ColumnMap's values — standard or custom field names alike. */
export type ShopperVisibility = Partial<Record<string, boolean>>

export interface Product {
  id: string
  sku?: string
  itemName: string
  price?: number
  category?: string
  locationCode?: string
  /** Set by auto-linker when locationCode matches a fixture */
  fixtureId?: string
  shopperVisible: ShopperVisibility
  /** Catch-all for retailer columns that didn't map to a standard field */
  [key: string]: unknown
}

// ─── UI state ────────────────────────────────────────────────────────────────

export type ActiveTool = 'select' | 'draw'

export type ActiveModal = 'import' | 'export' | 'properties' | null

export type ImportStatus = 'idle' | 'importing' | 'done' | 'error'

export type SidebarTab = 'fixtures' | 'products'

// ─── File formats ────────────────────────────────────────────────────────────

/** Store shape/scale info Shopper needs to draw the perimeter — same source-of-truth shapes as ProjectSettings, not a derived bounding box */
export interface StoreMetadata {
  name: string
  unit: Unit
  storeOutline: { x: number; y: number }[]
  perimeterThickness: number[]
}

/**
 * .ifp project file — full editable state saved by Builder.
 * JSON under the hood, renamed .ifp. `products`/`columnMap` are optional so a
 * file saved before Phase 5 (CSV import) added productStore still loads —
 * hydrateProject defaults them to empty.
 */
export interface ProjectFile {
  version: string
  settings: ProjectSettings
  customFixtureTypes: CustomFixtureType[]
  wallDefaults: { width: number; height: number }
  fixtures: Fixture[]
  walls: Wall[]
  entrances: Entrance[]
  products?: Product[]
  columnMap?: ColumnMap
  requiredFields?: string[]
}

/**
 * JSON data package — exported from Builder, loaded by Shopper.
 * Internal fields stripped; only shopper-visible product fields included
 * (which fields those are varies per project, so a product entry here is a
 * dynamic bag, not the full Product shape). Walls/entrances are included so
 * Shopper's map reads as an actual store, not floating fixture rectangles.
 */
export interface DataPackage {
  version: string
  store: StoreMetadata
  fixtures: Array<{
    id: string
    type: FixtureType
    label: string
    locationCode?: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }>
  walls: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }>
  entrances: Array<{
    id: string
    edgeIndex: number
    offset: number
    width: number
  }>
  /** Each entry: `id` + `fixtureId` (if linked) + whichever fields are shopperVisible — never the internal-only ones */
  products: Array<Record<string, unknown>>
}
