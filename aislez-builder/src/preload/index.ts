import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', {})
  } catch (error) {
    console.error(error)
  }
} else {
  // Non-isolated context (development fallback)
  Object.assign(window, { electron: electronAPI, api: {} })
}
