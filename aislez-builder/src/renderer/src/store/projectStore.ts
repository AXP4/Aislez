import { create } from 'zustand'
import type { Unit, ProjectSettings, CustomFixtureType } from '../types'

let _cftCounter = 0

const BUILTIN_DEFS = [
  { name: 'Shelf',     widthM: 1.2, heightM: 0.5, widthFt: 4.0, heightFt: 1.5, color: '#4A90D9', abbrev: 'SH' },
  { name: 'Chiller',   widthM: 1.0, heightM: 0.8, widthFt: 3.5, heightFt: 2.5, color: '#2ECC71', abbrev: 'CH' },
  { name: 'Bunker',    widthM: 1.2, heightM: 1.0, widthFt: 4.0, heightFt: 3.5, color: '#1ABC9C', abbrev: 'BK' },
  { name: 'End Cap',   widthM: 0.6, heightM: 1.0, widthFt: 2.0, heightFt: 3.5, color: '#E67E22', abbrev: 'EC' },
  { name: 'Side Kick', widthM: 0.3, heightM: 0.6, widthFt: 1.0, heightFt: 2.0, color: '#F39C12', abbrev: 'SK' },
  { name: 'Pallet',    widthM: 1.0, heightM: 1.2, widthFt: 3.5, heightFt: 4.0, color: '#8E44AD', abbrev: 'PL' },
  { name: 'Rack',      widthM: 0.6, heightM: 0.4, widthFt: 2.0, heightFt: 1.5, color: '#E74C3C', abbrev: 'RK' },
  { name: 'Table',     widthM: 1.2, heightM: 0.6, widthFt: 4.0, heightFt: 2.0, color: '#16A085', abbrev: 'TB' },
  { name: 'Bin',       widthM: 0.6, heightM: 0.6, widthFt: 2.0, heightFt: 2.0, color: '#D35400', abbrev: 'BN' },
]

function makeBuiltinTypes(unit: Unit): CustomFixtureType[] {
  return BUILTIN_DEFS.map((d, i) => ({
    id: `builtin_${i}`,
    name: d.name,
    width:  unit === 'feet' ? d.widthFt  : d.widthM,
    height: unit === 'feet' ? d.heightFt : d.heightM,
    color:  d.color,
    abbrev: d.abbrev
  }))
}

export interface WallDefaults {
  /** Length of a newly placed wall */
  width: number
  /** Thickness of a newly placed wall */
  height: number
}

function makeWallDefaults(unit: Unit): WallDefaults {
  return unit === 'feet' ? { width: 10, height: 0.75 } : { width: 3, height: 0.2 }
}

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

type SettingsUpdate = Partial<Pick<ProjectSettings, 'name' | 'unit' | 'storeWidth' | 'storeHeight' | 'gridSnap' | 'storeOutline'>>

interface ProjectStore {
  settings: ProjectSettings | null
  /** Pixels per real-world unit (derived from settings.unit) */
  pixelsPerUnit: number
  /** Snap grid size in pixels (= settings.gridSnap × pixelsPerUnit) */
  gridSizePx: number
  customFixtureTypes: CustomFixtureType[]
  /** Default length/thickness used when a new wall is dropped onto the canvas */
  wallDefaults: WallDefaults
  initProject: (settings: ProjectSettings) => void
  /** Update mutable project settings after creation (unit is immutable) */
  updateSettings: (updates: SettingsUpdate) => void
  /** Format a value in the project's unit, e.g. "1.20 m" or "4.00 ft" */
  formatUnit: (value: number) => string
  /** Compact form: "1.2m" or "4.0'" */
  formatUnitShort: (value: number) => string
  addCustomFixtureType: (type: Omit<CustomFixtureType, 'id'>) => void
  updateCustomFixtureType: (id: string, updates: Omit<CustomFixtureType, 'id'>) => void
  deleteCustomFixtureType: (id: string) => void
  updateWallDefaults: (updates: Partial<WallDefaults>) => void
}

function derive(settings: ProjectSettings): { pixelsPerUnit: number; gridSizePx: number } {
  const ppu = PIXELS_PER_UNIT[settings.unit]
  return { pixelsPerUnit: ppu, gridSizePx: settings.gridSnap * ppu }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  settings: null,
  pixelsPerUnit: PIXELS_PER_UNIT.meters,
  gridSizePx: DEFAULT_GRID_SNAP * PIXELS_PER_UNIT.meters,
  customFixtureTypes: [],
  wallDefaults: makeWallDefaults('meters'),

  initProject: (settings) => {
    set({
      settings, ...derive(settings),
      customFixtureTypes: makeBuiltinTypes(settings.unit),
      wallDefaults: makeWallDefaults(settings.unit)
    })
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
  },

  addCustomFixtureType: (type) => set((s) => ({
    customFixtureTypes: [...s.customFixtureTypes, { ...type, id: `cft_${Date.now()}_${++_cftCounter}` }]
  })),

  updateCustomFixtureType: (id, updates) => set((s) => ({
    customFixtureTypes: s.customFixtureTypes.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  deleteCustomFixtureType: (id) => set((s) => ({
    customFixtureTypes: s.customFixtureTypes.filter(t => t.id !== id)
  })),

  updateWallDefaults: (updates) => set((s) => ({
    wallDefaults: { ...s.wallDefaults, ...updates }
  }))
}))
