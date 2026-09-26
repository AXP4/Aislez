import type { ProjectFile } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { useProjectStore } from '../store/projectStore'
import { useProductStore } from '../store/productStore'

export const PROJECT_FILE_VERSION = '1.0'

/** Snapshots everything a .ifp file needs to fully restore the project — current store/canvas state, no selection or undo/redo history. */
export function serializeProject(): ProjectFile {
  const { settings, customFixtureTypes, wallDefaults } = useProjectStore.getState()
  const { fixtures, walls, entrances } = useCanvasStore.getState()
  const { products, columnMap, requiredFields } = useProductStore.getState()
  if (!settings) throw new Error('No active project to save')
  return { version: PROJECT_FILE_VERSION, settings, customFixtureTypes, wallDefaults, fixtures, walls, entrances, products, columnMap, requiredFields }
}

/** True if a parsed JSON value has the shape a .ifp file needs — guards against opening an unrelated or corrupted file. */
export function isValidProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.settings === 'object' && v.settings !== null &&
    Array.isArray(v.fixtures) && Array.isArray(v.walls) && Array.isArray(v.entrances) &&
    Array.isArray(v.customFixtureTypes) && typeof v.wallDefaults === 'object' &&
    (v.products === undefined || Array.isArray(v.products)) &&
    (v.columnMap === undefined || typeof v.columnMap === 'object') &&
    (v.requiredFields === undefined || Array.isArray(v.requiredFields))
}

/** Replaces all project/canvas/product state with a loaded file's contents. Files saved before Phase 5 have no products/columnMap/requiredFields — default to empty rather than failing to load. */
export function hydrateProject(file: ProjectFile): void {
  useProjectStore.getState().loadProject(file.settings, file.customFixtureTypes, file.wallDefaults)
  useCanvasStore.getState().loadCanvas(file.fixtures, file.walls, file.entrances)
  useProductStore.getState().importProducts(file.products ?? [], file.columnMap ?? {}, file.requiredFields ?? [])
}
