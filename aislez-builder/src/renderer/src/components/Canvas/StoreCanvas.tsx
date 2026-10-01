import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import GridLayer from './GridLayer'
import BackgroundLayer from './BackgroundLayer'
import FixtureLayer from './FixtureLayer'
import WallLayer from './WallLayer'
import EntranceLayer from './EntranceLayer'
import ArrowLayer from './ArrowLayer'
import PerimeterDrawLayer from './PerimeterDrawLayer'
import PerimeterWallLayer from './PerimeterWallLayer'
import Ruler, { RULER_SIZE } from './Ruler'
import { useCanvasStore, FIXTURE_DEFAULTS_BY_UNIT } from '../../store/canvasStore'
import { getChainMembers } from '../../utils/chain'
import { useUiStore, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { rectsOverlap, rectInsidePolygon, projectOntoSegment } from '../../utils/geometry'
import type { FixtureType } from '../../types'

interface StageSize {
  width: number
  height: number
}

export default function StoreCanvas(): React.ReactElement {
  const containerRef    = useRef<HTMLDivElement>(null)
  const stageWrapperRef = useRef<HTMLDivElement>(null)
  const stageRef        = useRef<Konva.Stage>(null)
  const selRectRef      = useRef<Konva.Rect>(null)
  const rubberStart     = useRef<{ x: number; y: number } | null>(null)
  const didRubberBand   = useRef(false)
  const [stageSize, setStageSize] = useState<StageSize>({ width: 800, height: 600 })

  const { addFixture, addWall, addEntrance, deselectAll, deleteFixture, deleteChain, deleteMulti, duplicateSelected, setMultiSelected, selectFixture: storeSelectFixture, selectedFixtureId, selectedChainAnchor, selectedWallId, deleteWall } = useCanvasStore()
  const { gridMode, tooltip, zoom, panX, panY, activeTool, setViewport, setStageSize: setUiStageSize } = useUiStore()
  const { settings, pixelsPerUnit, gridSizePx, wallDefaults } = useProjectStore()

  // Fill available space (minus rulers), propagate to uiStore for fit-to-store
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const w = el.offsetWidth  - RULER_SIZE
      const h = el.offsetHeight - RULER_SIZE
      setStageSize({ width: w, height: h })
      setUiStageSize(w, h)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setUiStageSize])

  // Non-passive wheel → zoom centred on cursor
  useEffect(() => {
    const el = stageWrapperRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom: z, panX: px, panY: py, setViewport: sv } = useUiStore.getState()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor))
      sv(newZoom, mx - (mx - px) * (newZoom / z), my - (my - py) * (newZoom / z))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Canvas panning — middle mouse or Ctrl+left drag
  useEffect(() => {
    const el = stageWrapperRef.current
    if (!el) return
    let panning = false
    let startCX = 0, startCY = 0, startPX = 0, startPY = 0

    const begin = (clientX: number, clientY: number): void => {
      panning = true
      startCX = clientX; startCY = clientY
      const s = useUiStore.getState()
      startPX = s.panX; startPY = s.panY
      el.style.cursor = 'grabbing'
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 1) { e.preventDefault(); begin(e.clientX, e.clientY) }
    }
    const onMouseMove = (e: MouseEvent): void => {
      if (!panning) return
      const { zoom, setViewport } = useUiStore.getState()
      setViewport(zoom, startPX + e.clientX - startCX, startPY + e.clientY - startCY)
    }
    const end = (): void => {
      if (panning) { panning = false; el.style.cursor = '' }
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', end)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', end)
    }
  }, [])

  // Rubber band selection — track on window so the box updates even when cursor leaves the stage
  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!rubberStart.current || !stageRef.current || !selRectRef.current) return
      const { panX, panY, zoom } = useUiStore.getState()
      const rect = stageRef.current.container().getBoundingClientRect()
      const ex = (e.clientX - rect.left - panX) / zoom
      const ey = (e.clientY - rect.top  - panY) / zoom
      const { x: sx, y: sy } = rubberStart.current
      const bx = Math.min(sx, ex), by = Math.min(sy, ey)
      const bw = Math.abs(ex - sx),  bh = Math.abs(ey - sy)
      const z = useUiStore.getState().zoom
      selRectRef.current.setAttrs({ x: bx, y: by, width: bw, height: bh, visible: true, strokeWidth: 1 / z, dash: [4 / z, 4 / z] })
      selRectRef.current.getLayer()?.batchDraw()
    }

    const onMouseUp = (e: MouseEvent): void => {
      if (!rubberStart.current || e.button !== 0) return
      const stage = stageRef.current
      if (stage && selRectRef.current) {
        const { panX, panY, zoom } = useUiStore.getState()
        const rect = stage.container().getBoundingClientRect()
        const ex = (e.clientX - rect.left - panX) / zoom
        const ey = (e.clientY - rect.top  - panY) / zoom
        const { x: sx, y: sy } = rubberStart.current
        const bx = Math.min(sx, ex), by = Math.min(sy, ey)
        const bw = Math.abs(ex - sx),  bh = Math.abs(ey - sy)

        if (bw > 2 || bh > 2) {
          didRubberBand.current = true
          const { fixtures } = useCanvasStore.getState()
          const { pixelsPerUnit } = useProjectStore.getState()
          const hit = fixtures.filter(f => {
            const fx = f.x * pixelsPerUnit, fy = f.y * pixelsPerUnit
            const fw = f.width * pixelsPerUnit, fh = f.height * pixelsPerUnit
            return fx < bx + bw && fx + fw > bx && fy < by + bh && fy + fh > by
          }).map(f => f.id)
          if (hit.length === 1) storeSelectFixture(hit[0])
          else if (hit.length > 1) setMultiSelected(hit)
        }

        selRectRef.current.setAttrs({ visible: false, width: 0, height: 0 })
        selRectRef.current.getLayer()?.batchDraw()
      }
      rubberStart.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setMultiSelected, storeSelectFixture])

  // Delete / Backspace / Ctrl+D
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = useCanvasStore.getState()
        if (s.backgroundImageSelected) {
          useProjectStore.getState().clearBackgroundImage()
          s.selectBackgroundImage(false)
        } else if (s.selectedEntranceId) {
          s.deleteEntrance(s.selectedEntranceId)
        } else if (s.selectedWallId) {
          deleteWall(s.selectedWallId)
        } else if (s.selectedFixtureId) {
          deleteFixture(s.selectedFixtureId)
        } else if (s.selectedChainAnchor) {
          const ids = getChainMembers(s.fixtures, s.selectedChainAnchor).map(f => f.id)
          deleteChain(ids)
        } else if (s.multiSelectedIds.length > 0) {
          deleteMulti(s.multiSelectedIds)
        }
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const { settings } = useProjectStore.getState()
        if (!settings) return
        duplicateSelected(settings.gridSnap, settings.gridSnap)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedFixtureId, selectedChainAnchor, deleteFixture, deleteChain, duplicateSelected])

  // Drop from sidebar → convert screen → content coords, snap, place
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): void => {
      e.preventDefault()
      if (!stageRef.current || !settings || activeTool === 'draw') return

      // Wall drop
      if (e.dataTransfer.getData('itemType') === 'wall') {
        const defaultW = wallDefaults.width
        const defaultH = wallDefaults.height
        const box = stageRef.current.container().getBoundingClientRect()
        const contentX = (e.clientX - box.left - panX) / zoom
        const contentY = (e.clientY - box.top  - panY) / zoom
        const pw = defaultW * pixelsPerUnit
        const ph = defaultH * pixelsPerUnit
        const rawPxX = contentX - pw / 2
        const rawPxY = contentY - ph / 2
        const snappedPxX = gridMode === 'off' ? rawPxX : Math.round(rawPxX / gridSizePx) * gridSizePx
        const snappedPxY = gridMode === 'off' ? rawPxY : Math.round(rawPxY / gridSizePx) * gridSizePx
        const wallX = Math.round(snappedPxX / pixelsPerUnit * 100) / 100
        const wallY = Math.round(snappedPxY / pixelsPerUnit * 100) / 100

        // Can't drop a wall onto a fixture, another wall, or outside the perimeter
        const newWallRect = { x: wallX, y: wallY, width: defaultW, height: defaultH }
        const { walls, fixtures } = useCanvasStore.getState()
        if (walls.some((w) => rectsOverlap(newWallRect, w))) return
        if (fixtures.some((f) => rectsOverlap(newWallRect, f))) return
        if (!rectInsidePolygon(newWallRect, settings.storeOutline)) return

        addWall(wallX, wallY, defaultW, defaultH)
        return
      }

      // Entrance drop — must land near the store's perimeter outline; hosted
      // on whichever edge is closest, not free-standing
      if (e.dataTransfer.getData('itemType') === 'entrance') {
        const box = stageRef.current.container().getBoundingClientRect()
        const worldX = (e.clientX - box.left - panX) / zoom / pixelsPerUnit
        const worldY = (e.clientY - box.top  - panY) / zoom / pixelsPerUnit

        const outline = settings.storeOutline
        let best: { edgeIndex: number; offset: number; length: number; distSq: number } | null = null
        for (let i = 0; i < outline.length; i++) {
          const proj = projectOntoSegment({ x: worldX, y: worldY }, outline[i], outline[(i + 1) % outline.length])
          if (!best || proj.distSq < best.distSq) best = { edgeIndex: i, offset: proj.offset, length: proj.length, distSq: proj.distSq }
        }
        const SNAP_THRESHOLD = 0.5  // world units
        if (!best || Math.sqrt(best.distSq) > SNAP_THRESHOLD) return

        const defaultWidth = Math.min(settings.unit === 'feet' ? 3 : 1, best.length)
        addEntrance(best.edgeIndex, best.offset - defaultWidth / 2, defaultWidth)
        return
      }

      const fixtureType = e.dataTransfer.getData('fixtureType') as FixtureType
      if (!fixtureType) return

      let width: number, height: number, label: string | undefined, customTypeId: string | undefined

      if (fixtureType === 'custom') {
        const ctId = e.dataTransfer.getData('customTypeId')
        const ct = useProjectStore.getState().customFixtureTypes.find(t => t.id === ctId)
        if (!ct) return
        width = ct.width; height = ct.height; label = ct.name; customTypeId = ctId
      } else {
        const defaults = FIXTURE_DEFAULTS_BY_UNIT[settings.unit][fixtureType]
        width = defaults.width; height = defaults.height
      }

      const box = stageRef.current.container().getBoundingClientRect()
      const screenX = e.clientX - box.left
      const screenY = e.clientY - box.top
      const contentX = (screenX - panX) / zoom
      const contentY = (screenY - panY) / zoom

      const pw = width  * pixelsPerUnit
      const ph = height * pixelsPerUnit
      const rawPxX = contentX - pw / 2
      const rawPxY = contentY - ph / 2
      const snappedPxX = gridMode === 'off' ? rawPxX : Math.round(rawPxX / gridSizePx) * gridSizePx
      const snappedPxY = gridMode === 'off' ? rawPxY : Math.round(rawPxY / gridSizePx) * gridSizePx
      const x = Math.round(snappedPxX / pixelsPerUnit * 100) / 100
      const y = Math.round(snappedPxY / pixelsPerUnit * 100) / 100

      // Can't place a fixture on a wall or outside the store's perimeter
      const newRect = { x, y, width, height }
      const { walls } = useCanvasStore.getState()
      if (walls.some((w) => rectsOverlap(newRect, w))) return
      if (!rectInsidePolygon(newRect, settings.storeOutline)) return

      addFixture(fixtureType, x, y, width, height, label, customTypeId)
    },
    [addFixture, addWall, addEntrance, settings, pixelsPerUnit, gridSizePx, zoom, panX, panY, gridMode, wallDefaults, activeTool]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
  }, [])

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>): void => {
      if (activeTool === 'draw') return
      if (e.evt.button !== 0) return
      if (e.target !== e.target.getStage()) return  // only on empty canvas
      if (!stageRef.current) return
      const { panX, panY, zoom } = useUiStore.getState()
      const rect = stageRef.current.container().getBoundingClientRect()
      const sx = (e.evt.clientX - rect.left - panX) / zoom
      const sy = (e.evt.clientY - rect.top  - panY) / zoom
      rubberStart.current = { x: sx, y: sy }
    },
    [activeTool]
  )

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>): void => {
      if (activeTool === 'draw') return
      if (didRubberBand.current) { didRubberBand.current = false; return }
      if (!e.evt.ctrlKey && e.target === e.target.getStage()) deselectAll()
    },
    [deselectAll, activeTool]
  )

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {settings && (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: RULER_SIZE, height: RULER_SIZE,
            background: '#1a1a2e',
            borderRight: '1px solid #2a2a44', borderBottom: '1px solid #2a2a44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, color: '#3a3a5a', zIndex: 10
          }}>
            {settings.unit === 'meters' ? 'm' : 'ft'}
          </div>

          <Ruler orientation="horizontal" length={stageSize.width}
            pixelsPerUnit={pixelsPerUnit} unit={settings.unit}
            zoom={zoom} panOffset={panX} />
          <Ruler orientation="vertical" length={stageSize.height}
            pixelsPerUnit={pixelsPerUnit} unit={settings.unit}
            zoom={zoom} panOffset={panY} />
        </>
      )}

      {/* Stage wrapper — wheel events attached here */}
      <div
        ref={stageWrapperRef}
        style={{ position: 'absolute', top: RULER_SIZE, left: RULER_SIZE, right: 0, bottom: 0 }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          x={panX}
          y={panY}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={handleStageMouseDown}
          onClick={handleStageClick}
          onTap={handleStageClick}
          style={{ background: '#f8f9fb' }}
        >
          {/* Floorplan reference photo — bottommost, so the grid and everything
              else still render on top of it. */}
          <BackgroundLayer />

          {gridMode !== 'off' && (() => {
            // Render only the visible viewport area, snapped to grid boundaries.
            // This keeps dot/line count bounded regardless of zoom or pan.
            const gsz  = Math.max(1, gridSizePx)
            const left = Math.floor(-panX / zoom / gsz) * gsz
            const top  = Math.floor(-panY / zoom / gsz) * gsz
            const right  = Math.ceil((stageSize.width  - panX) / zoom / gsz) * gsz + gsz
            const bottom = Math.ceil((stageSize.height - panY) / zoom / gsz) * gsz + gsz
            return (
              <GridLayer
                width={right - left} height={bottom - top}
                gridSizePx={gridSizePx} mode={gridMode}
                offsetX={left} offsetY={top}
              />
            )
          })()}

          {/* Perimeter — a border band drawn outward from settings.storeOutline,
              which itself stays the true interior boundary. Containment is
              handled separately by rectInsidePolygon against that same outline,
              so thickening the perimeter here never eats into floor space.
              Hidden while actively drawing a custom outline — until it's
              finalized, storeOutline is just a throwaway placeholder rectangle
              (initProject needs some valid outline immediately), not something
              that should ever be visible. */}
          {activeTool !== 'draw' && <PerimeterWallLayer />}

          <WallLayer />
          <EntranceLayer />
          <FixtureLayer />
          <ArrowLayer />
          {activeTool === 'draw' && <PerimeterDrawLayer />}
          {/* Rubber band selection rectangle — always mounted, hidden when inactive */}
          <Layer listening={false}>
            <Rect
              ref={selRectRef}
              visible={false}
              fill="rgba(74,144,217,0.08)"
              stroke="#4A90D9"
              strokeWidth={1}
            />
          </Layer>
        </Stage>
      </div>

      {activeTool === 'draw' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2e', color: '#dde0e8', border: '1px solid #3a3a5a',
          borderRadius: 6, padding: '7px 14px', fontSize: 12, lineHeight: 1.5,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20
        }}>
          Click to place corners &middot; type a number for an exact length &middot; click the start point to finish &middot; Backspace to undo last corner &middot; Esc to cancel
        </div>
      )}

      {tooltip.visible && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          background: '#1a1a2e', color: '#dde0e8',
          border: '1px solid #3a3a5a', borderRadius: 5,
          padding: '5px 9px', fontSize: 12, lineHeight: 1.6,
          whiteSpace: 'pre', pointerEvents: 'none', zIndex: 9999
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
