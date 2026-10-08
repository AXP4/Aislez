import { create } from 'zustand'
import type { ActiveTool, SidebarTab } from '../types'

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

/** A point placed so far by a click-to-place tool (world units) — the perimeter sketch tool's corners, or the calibrate tool's two reference clicks */
export interface ToolPoint { x: number; y: number }

interface UiStore {
  gridMode: GridMode
  activeTool: ActiveTool
  cycleGridMode: () => void
  /** Changing tools always discards any in-progress click sequence (sketch corners, calibration points) — same as the old per-tool layer unmounting used to */
  setActiveTool: (tool: ActiveTool) => void

  // ── Click-to-place tools (Draw mode, Calibrate mode) ────────────────────────
  /** Points placed so far by whichever click-to-place tool is active */
  toolPoints: ToolPoint[]
  pushToolPoint: (p: ToolPoint) => void
  /** Undo the last placed point — shared by Backspace, Ctrl+Z, and the toolbar Undo button while a click-to-place tool is active */
  popToolPoint: () => void
  /** Overwrites the last placed point in place — used to snap it onto the grid when grid mode turns back on mid-sketch */
  replaceLastToolPoint: (p: ToolPoint) => void
  tooltip: TooltipState
  showTooltip: (text: string, x: number, y: number) => void
  hideTooltip: () => void
  ctrlHeld: boolean
  setCtrlHeld: (v: boolean) => void

  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void

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
  /** Scale + center the view so the given content bounding box (pixels) fits on screen */
  fitToStore: (minX: number, minY: number, maxX: number, maxY: number) => void
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

export const useUiStore = create<UiStore>((set, get) => ({
  gridMode: 'dots',
  activeTool: 'select',
  cycleGridMode: () => set((s) => ({ gridMode: CYCLE[s.gridMode] })),
  setActiveTool: (tool) => set({ activeTool: tool, toolPoints: [] }),

  toolPoints: [],
  pushToolPoint: (p) => set((s) => ({ toolPoints: [...s.toolPoints, p] })),
  popToolPoint: () => set((s) => ({ toolPoints: s.toolPoints.slice(0, -1) })),
  replaceLastToolPoint: (p) => set((s) => (
    s.toolPoints.length ? { toolPoints: [...s.toolPoints.slice(0, -1), p] } : s
  )),

  tooltip: { visible: false, text: '', x: 0, y: 0 },
  showTooltip: (text, x, y) => set({ tooltip: { visible: true, text, x, y } }),
  hideTooltip: () => set((s) => ({ tooltip: { ...s.tooltip, visible: false } })),
  ctrlHeld: false,
  setCtrlHeld: (v) => set({ ctrlHeld: v }),

  sidebarTab: 'fixtures',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

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

  fitToStore: (minX, minY, maxX, maxY) => set((s) => {
    const w = maxX - minX
    const h = maxY - minY
    if (s.stageWidth <= 0 || s.stageHeight <= 0 || w <= 0 || h <= 0) return s
    const PAD = 40
    const scale = clampZoom(Math.min(
      (s.stageWidth  - PAD * 2) / w,
      (s.stageHeight - PAD * 2) / h
    ))
    return {
      zoom: scale,
      panX: (s.stageWidth  - w * scale) / 2 - minX * scale,
      panY: (s.stageHeight - h * scale) / 2 - minY * scale
    }
  })
}))
