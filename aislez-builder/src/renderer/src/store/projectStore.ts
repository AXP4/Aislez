import { create } from 'zustand'
import type { Unit, ProjectSettings } from '../types'

/** How many canvas pixels represent one real-world unit */
export const PIXELS_PER_UNIT: Record<Unit, number> = {
  meters: 60,
  feet:   24
}

/** Snap defaults and constraints (in real-world units) */
export const DEFAULT_GRID_SNAP = 1.0
export const MIN_GRID_SNAP     = 0.05
export const MAX_GRID_SNAP     = 1.0

/** Sensible default store dimensions when switching units */
export const DEFAULT_DIMENSIONS: Record<Unit, { width: number; height: number }> = {
  meters: { width: 30, height: 20 },
  feet:   { width: 100, height: 65 }
}

type SettingsUpdate = Partial<Pick<ProjectSettings, 'name' | 'unit' | 'storeWidth' | 'storeHeight' | 'gridSnap'>>

interface ProjectStore {
  settings: ProjectSettings | null
  /** Pixels per real-world unit (derived from settings.unit) */
  pixelsPerUnit: number
  /** Snap grid size in pixels (= settings.gridSnap × pixelsPerUnit) */
  gridSizePx: number
  initProject: (settings: ProjectSettings) => void
  /** Update mutable project settings after creation (unit is immutable) */
  updateSettings: (updates: SettingsUpdate) => void
  /** Format a value in the project's unit, e.g. "1.20 m" or "4.00 ft" */
  formatUnit: (value: number) => string
  /** Compact form: "1.2m" or "4.0'" */
  formatUnitShort: (value: number) => string
}

function derive(settings: ProjectSettings): { pixelsPerUnit: number; gridSizePx: number } {
  const ppu = PIXELS_PER_UNIT[settings.unit]
  return { pixelsPerUnit: ppu, gridSizePx: settings.gridSnap * ppu }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  settings: null,
  pixelsPerUnit: PIXELS_PER_UNIT.meters,
  gridSizePx: DEFAULT_GRID_SNAP * PIXELS_PER_UNIT.meters,

  initProject: (settings) => {
    set({ settings, ...derive(settings) })
  },

  updateSettings: (updates) => {
    set((state) => {
      if (!state.settings) return state
      const next: ProjectSettings = { ...state.settings, ...updates }
      return { settings: next, ...derive(next) }
    })
  },

  formatUnit: (value) => {
    const { settings } = get()
    const suffix = settings?.unit === 'feet' ? 'ft' : 'm'
    return `${value.toFixed(2)} ${suffix}`
  },

  formatUnitShort: (value) => {
    const { settings } = get()
    return settings?.unit === 'feet' ? `${value.toFixed(1)}'` : `${value.toFixed(1)}m`
  }
}))
