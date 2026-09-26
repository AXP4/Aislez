import { create } from 'zustand'
import type { Product, ColumnMap } from '../types'

interface ProductStore {
  products: Product[]
  /** How the last-imported CSV's own column headers mapped to standard fields */
  columnMap: ColumnMap
  /** Field names currently marked "every item needs this" — set at import time, editable anytime after in the Fields panel */
  requiredFields: string[]
  /** Replaces the product list wholesale — re-importing a corrected CSV starts fresh rather than merging with the old one */
  importProducts: (products: Product[], columnMap: ColumnMap, requiredFields: string[]) => void
  /** Replaces just the product array — used by relinkAllProducts, which recomputes fixtureId without touching columnMap */
  setProducts: (products: Product[]) => void
  /** Sets whether a field is shopper-visible across every product that has it — visibility is a property of the field, not any one product */
  setFieldVisibility: (fieldName: string, visible: boolean) => void
  /** Marks a field required (or not) going forward — does not retroactively remove existing products missing it */
  setFieldRequired: (fieldName: string, required: boolean) => void
  /** Removes a single product, e.g. one that was imported by mistake or is no longer carried */
  deleteProduct: (id: string) => void
  /**
   * Replaces one product's own fields wholesale (id/fixtureId/shopperVisible are
   * preserved from the existing record) — a full replace, not a merge, so
   * removing a custom field in the editor actually removes it rather than
   * leaving the old value behind.
   */
  updateProduct: (id: string, fields: Record<string, unknown>) => void
  clearProducts: () => void
}

export const useProductStore = create<ProductStore>((set) => ({
  products: [],
  columnMap: {},
  requiredFields: [],

  importProducts: (products, columnMap, requiredFields) => set({ products, columnMap, requiredFields }),

  setProducts: (products) => set({ products }),

  setFieldVisibility: (fieldName, visible) => set((s) => ({
    products: s.products.map((p) => ({ ...p, shopperVisible: { ...p.shopperVisible, [fieldName]: visible } }))
  })),

  setFieldRequired: (fieldName, required) => set((s) => ({
    requiredFields: required
      ? [...new Set([...s.requiredFields, fieldName])]
      : s.requiredFields.filter((f) => f !== fieldName)
  })),

  deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

  updateProduct: (id, fields) => set((s) => ({
    products: s.products.map((p) =>
      p.id === id ? { ...fields, id: p.id, fixtureId: p.fixtureId, shopperVisible: p.shopperVisible } as Product : p
    )
  })),

  clearProducts: () => set({ products: [], columnMap: {}, requiredFields: [] })
}))
