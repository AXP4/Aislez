import { useProjectStore } from '../store/projectStore'
import { serializeProject, hydrateProject, isValidProjectFile } from './projectFile'

interface SaveResult {
  canceled: boolean
  filePath?: string
  error?: string
}

interface OpenResult {
  canceled: boolean
  filePath?: string
  data?: string
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ipcRenderer(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electron?.ipcRenderer
}

/** Saves to the current file path if one is known (plain Ctrl+S resave); otherwise prompts with a native save dialog. */
export async function saveProject(): Promise<void> {
  const { settings, currentFilePath, setCurrentFilePath } = useProjectStore.getState()
  if (!settings) return
  const ipc = ipcRenderer()
  if (!ipc) return

  let json: string
  try {
    json = JSON.stringify(serializeProject(), null, 2)
  } catch (err) {
    window.alert(`Couldn't save project: ${(err as Error).message}`)
    return
  }

  const result: SaveResult = await ipc.invoke('project:save', json, settings.name, currentFilePath)
  if (result.error) { window.alert(`Couldn't save project: ${result.error}`); return }
  if (result.canceled) return
  if (result.filePath) setCurrentFilePath(result.filePath)
}

/** Opens a native file dialog, loads the chosen .ifp, and replaces the current project. Returns true on success. */
export async function openProject(): Promise<boolean> {
  const ipc = ipcRenderer()
  if (!ipc) return false

  const result: OpenResult = await ipc.invoke('project:open')
  if (result.canceled) return false
  if (result.error) { window.alert(`Couldn't open project: ${result.error}`); return false }
  if (!result.data) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(result.data)
  } catch {
    window.alert("That file isn't valid JSON — it may be corrupted.")
    return false
  }
  if (!isValidProjectFile(parsed)) {
    window.alert("That file doesn't look like a valid Aislez project.")
    return false
  }

  hydrateProject(parsed)
  useProjectStore.getState().setCurrentFilePath(result.filePath ?? null)
  return true
}
