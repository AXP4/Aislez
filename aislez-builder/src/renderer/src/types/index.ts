// ─── Project / unit system ───────────────────────────────────────────────────

export type Unit = 'meters' | 'feet'

export interface ProjectSettings {
  name: string
  unit: Unit
  /** Store width in the chosen unit */
  storeWidth: number
  /** Store height in the chosen unit */
  storeHeight: number
  /** Snap increment in the chosen unit (0.01 – 1.0) */
  gridSnap: number
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
}

// ─── Product ─────────────────────────────────────────────────────────────────

/** Standard column names products can be mapped to */
export type ColumnKey = 'sku' | 'itemName' | 'price' | 'category' | 'locationCode'

/** Maps the retailer's CSV column header → our standard field name */
export type ColumnMap = Partial<Record<string, ColumnKey>>

/** Controls which fields are exported to Shopper vs kept internal */
export type ShopperVisibility = Partial<Record<ColumnKey, boolean>>

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

/** Shared store metadata used in both file formats */
export interface StoreMetadata {
  name: string
  width: number
  height: number
}

/**
 * .ifp project file — full editable state saved by Builder.
 * JSON under the hood, renamed .ifp.
 */
export interface ProjectFile {
  version: string
  store: StoreMetadata
  fixtures: Fixture[]
  products: Product[]
  columnMap: ColumnMap
  backgroundImage: string | null
}

/**
 * JSON data package — exported from Builder, loaded by Shopper.
 * Internal fields stripped; only shopper-visible product fields included.
 */
export interface DataPackage {
  version: string
  store: StoreMetadata
  fixtures: Array<{
    id: string
    type: FixtureType
    locationCode: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }>
  products: Array<{
    itemName: string
    price?: number
    category?: string
    locationCode?: string
  }>
}
