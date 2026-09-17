import type { ProjectFile } from '../types'
import { useCanvasStore } from '../store/canvasStore'
import { useProjectStore } from '../store/projectStore'

export const PROJECT_FILE_VERSION = '1.0'

/** Snapshots everything a .ifp file needs to fully restore the project — current store/canvas state, no selection or undo/redo history. */
export function serializeProject(): ProjectFile {
  const { settings, customFixtureTypes, wallDefaults } = useProjectStore.getState()
  const { fixtures, walls, entrances } = useCanvasStore.getState()
  if (!settings) throw new Error('No active project to save')
  return { version: PROJECT_FILE_VERSION, settings, customFixtureTypes, wallDefaults, fixtures, walls, entrances }
}

/** True if a parsed JSON value has the shape a .ifp file needs — guards against opening an unrelated or corrupted file. */
export function isValidProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.settings === 'object' && v.settings !== null &&
    Array.isArray(v.fixtures) && Array.isArray(v.walls) && Array.isArray(v.entrances) &&
    Array.isArray(v.customFixtureTypes) && typeof v.wallDefaults === 'object'
}

/** Replaces all project/canvas state with a loaded file's contents. */
export function hydrateProject(file: ProjectFile): void {
  useProjectStore.getState().loadProject(file.settings, file.customFixtureTypes, file.wallDefaults)
  useCanvasStore.getState().loadCanvas(file.fixtures, file.walls, file.entrances)
}
