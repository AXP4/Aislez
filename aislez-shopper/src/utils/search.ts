import type { Product } from '../types'

/** Case-insensitive partial match on item name and category. Empty query returns no results, not everything — Shopper is for finding something specific. */
export function searchProducts(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return products.filter((p) => {
    const name = p.itemName.toLowerCase()
    const category = typeof p.category === 'string' ? p.category.toLowerCase() : ''
    return name.includes(q) || category.includes(q)
  })
}
