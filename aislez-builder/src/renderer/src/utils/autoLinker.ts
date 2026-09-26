import type { Fixture, Product } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { useProductStore } from '../store/productStore'

export interface LinkResult {
  products: Product[]
  linkedCount: number
  unlinkedCount: number
}

/**
 * Matches each product's locationCode to a fixture's locationCode, setting
 * fixtureId on match. Products with no locationCode, or one that matches no
 * placed fixture, come back with fixtureId cleared — flagged as unlinked in
 * the UI rather than silently dropped.
 */
export function linkProductsToFixtures(products: Product[], fixtures: Fixture[]): LinkResult {
  const fixtureIdByCode = new Map<string, string>()
  for (const f of fixtures) {
    if (f.locationCode) fixtureIdByCode.set(f.locationCode, f.id)
  }

  let linkedCount = 0
  const linked = products.map((p) => {
    const fixtureId = p.locationCode ? fixtureIdByCode.get(p.locationCode) : undefined
    if (fixtureId) linkedCount++
    return { ...p, fixtureId }
  })

  return { products: linked, linkedCount, unlinkedCount: products.length - linkedCount }
}

/**
 * Re-runs linking against the fixtures on the canvas right now, without
 * touching anything else about the imported products. Needed because linking
 * only happens once, at import time — placing or coding a fixture *after*
 * importing doesn't retroactively link anything on its own.
 */
export function relinkAllProducts(): LinkResult {
  const { products } = useProductStore.getState()
  const { fixtures } = useCanvasStore.getState()
  const result = linkProductsToFixtures(products, fixtures)
  useProductStore.getState().setProducts(result.products)
  return result
}
