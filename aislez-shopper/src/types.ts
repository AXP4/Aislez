// Mirrors aislez-builder's DataPackage shape (types/index.ts). Hand-maintained,
// not shared code — Builder and Shopper are separate projects/repos connected
// only by this JSON contract.

export interface Fixture {
  id: string
  type: string
  label: string
  locationCode?: string
  color: string
  abbrev: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface Wall {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface Entrance {
  id: string
  edgeIndex: number
  offset: number
  width: number
}

/**
 * Which fields exist (beyond id/fixtureId/itemName) varies per store — the
 * retailer chooses what's shopper-visible in Builder. itemName is the only
 * field guaranteed present (Builder requires it on every product).
 */
export interface Product {
  id: string
  fixtureId?: string
  itemName: string
  price?: number
  category?: string
  [key: string]: unknown
}

export interface DataPackage {
  version: string
  store: {
    name: string
    unit: 'meters' | 'feet'
    storeOutline: { x: number; y: number }[]
    perimeterThickness: number[]
    wallColor: string
    /** Page color around the outside of the store map — missing on a data package exported before this field existed. */
    mapBackgroundColor?: string
  }
  fixtures: Fixture[]
  walls: Wall[]
  entrances: Entrance[]
  products: Product[]
}
