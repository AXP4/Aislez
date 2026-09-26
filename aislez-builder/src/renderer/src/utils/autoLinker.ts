import type { Fixture, Product } from '../types'

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
