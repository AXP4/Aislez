import type { DataPackage, Product } from '../types'
import { WALL_COLOR } from '../types'
import { useProjectStore } from '../store/projectStore'
import { useCanvasStore } from '../store/canvasStore'
import { useProductStore } from '../store/productStore'
import { resolveFixtureColor, resolveFixtureAbbrev } from '../components/Canvas/FixtureLayer'

export const DATA_PACKAGE_VERSION = '1.0'

/** Keeps only `id`, `fixtureId` (Shopper needs it to highlight the right fixture), and whatever fields the retailer marked shopper-visible — everything else (internal SKU, margin, inventory counts, etc.) is dropped, not just hidden. */
function stripProduct(p: Product): Record<string, unknown> {
  const out: Record<string, unknown> = { id: p.id }
  if (p.fixtureId) out.fixtureId = p.fixtureId
  for (const [key, value] of Object.entries(p)) {
    if (key === 'id' || key === 'fixtureId' || key === 'shopperVisible') continue
    if (value === undefined) continue
    if (p.shopperVisible[key]) out[key] = value
  }
  return out
}

/** Builds the JSON data package Shopper will load — a read-only, stripped-down snapshot of the current project. Pure data transform; callers handle writing it to disk. */
export function buildDataPackage(): DataPackage {
  const { settings, customFixtureTypes } = useProjectStore.getState()
  const { fixtures, walls, entrances } = useCanvasStore.getState()
  const { products } = useProductStore.getState()
  if (!settings) throw new Error('No active project to export')

  return {
    version: DATA_PACKAGE_VERSION,
    store: {
      name: settings.name,
      unit: settings.unit,
      storeOutline: settings.storeOutline,
      perimeterThickness: settings.perimeterThickness,
      wallColor: WALL_COLOR
    },
    fixtures: fixtures.map((f) => ({
      id: f.id, type: f.type, label: f.label, locationCode: f.locationCode,
      color: resolveFixtureColor(f, customFixtureTypes),
      abbrev: resolveFixtureAbbrev(f, customFixtureTypes),
      x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation
    })),
    walls: walls.map((w) => ({ id: w.id, x: w.x, y: w.y, width: w.width, height: w.height, rotation: w.rotation })),
    entrances: entrances.map((e) => ({ id: e.id, edgeIndex: e.edgeIndex, offset: e.offset, width: e.width })),
    products: products.map(stripProduct)
  }
}
