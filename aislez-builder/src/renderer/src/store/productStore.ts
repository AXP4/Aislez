import { create } from 'zustand'
import type { Product, ColumnMap } from '../types'

interface ProductStore {
  products: Product[]
  /** How the last-imported CSV's own column headers mapped to standard fields */
  columnMap: ColumnMap
  /** Replaces the product list wholesale — re-importing a corrected CSV starts fresh rather than merging with the old one */
  importProducts: (products: Product[], columnMap: ColumnMap) => void
  clearProducts: () => void
}

export const useProductStore = create<ProductStore>((set) => ({
  products: [],
  columnMap: {},

  importProducts: (products, columnMap) => set({ products, columnMap }),

  clearProducts: () => set({ products: [], columnMap: {} })
}))
