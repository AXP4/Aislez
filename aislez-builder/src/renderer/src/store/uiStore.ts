import { create } from 'zustand'
import type { ActiveTool } from '../types'

export type GridMode = 'dots' | 'lines' | 'off'

const CYCLE: Record<GridMode, GridMode> = { dots: 'lines', lines: 'off', off: 'dots' }

export const MIN_ZOOM  = 0.05
export const MAX_ZOOM  = 8.0
export const ZOOM_STEP = 1.25

interface TooltipState {
  visible: boolean
  text: string
  x: number
  y: number
}

interface UiStore {
  gridMode: GridMode
  activeTool: ActiveTool
  cycleGridMode: () => void
  setActiveTool: (tool: ActiveTool) => void
  tooltip: TooltipState
  showTooltip: (text: string, x: number, y: number) => void
  hideTooltip: () => void
  ctrlHeld: boolean
  setCtrlHeld: (v: boolean) => void

  // ── Viewport ─────────────────────────────────────────────────────────────
  zoom: number
  panX: number
  panY: number
  /** Stage canvas dimensions, updated by StoreCanvas ResizeObserver */
  stageWidth: number
  stageHeight: number
  setViewport: (zoom: number, panX: number, panY: number) => void
  setStageSize: (width: number, height: number) => void
  zoomIn:    () => void
  zoomOut:   () => void
  resetZoom: () => void
  /** Scale + center the view so the entire store footprint fits on screen */
  fitToStore: (storePixelW: number, storePixelH: number) => void
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export const useUiStore = create<UiStore>((set, get) => ({
  gridMode: 'dots',
  activeTool: 'select',
  cycleGridMode: () => set((s) => ({ gridMode: CYCLE[s.gridMode] })),
  setActiveTool: (tool) => set({ activeTool: tool }),

  tooltip: { visible: false, text: '', x: 0, y: 0 },
  showTooltip: (text, x, y) => set({ tooltip: { visible: true, text, x, y } }),
  hideTooltip: () => set((s) => ({ tooltip: { ...s.tooltip, visible: false } })),
  ctrlHeld: false,
  setCtrlHeld: (v) => set({ ctrlHeld: v }),

  // Viewport
  zoom: 1,
  panX: 0,
  panY: 0,
  stageWidth: 800,
  stageHeight: 600,

  setViewport: (zoom, panX, panY) => set({ zoom: clampZoom(zoom), panX, panY }),

  setStageSize: (width, height) => set({ stageWidth: width, stageHeight: height }),

  zoomIn: () => set((s) => {
    const newZoom = clampZoom(s.zoom * ZOOM_STEP)
    const cx = s.stageWidth / 2
    const cy = s.stageHeight / 2
    return {
      zoom: newZoom,
      panX: cx - (cx - s.panX) * (newZoom / s.zoom),
      panY: cy - (cy - s.panY) * (newZoom / s.zoom)
    }
  }),

  zoomOut: () => set((s) => {
    const newZoom = clampZoom(s.zoom / ZOOM_STEP)
    const cx = s.stageWidth / 2
    const cy = s.stageHeight / 2
    return {
      zoom: newZoom,
      panX: cx - (cx - s.panX) * (newZoom / s.zoom),
      panY: cy - (cy - s.panY) * (newZoom / s.zoom)
    }
  }),

  resetZoom: () => set({ zoom: 1, panX: 0, panY: 0 }),

  fitToStore: (storePixelW, storePixelH) => set((s) => {
    if (s.stageWidth <= 0 || s.stageHeight <= 0 || storePixelW <= 0 || storePixelH <= 0)
      return s
    const PAD = 40
    const scale = clampZoom(Math.min(
      (s.stageWidth  - PAD * 2) / storePixelW,
      (s.stageHeight - PAD * 2) / storePixelH
    ))
    return {
      zoom: scale,
      panX: (s.stageWidth  - storePixelW * scale) / 2,
      panY: (s.stageHeight - storePixelH * scale) / 2
    }
  })
}))
