import React, { useRef, useCallback } from 'react'
import { Layer, Line, Group, Rect } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import type { Entrance } from '../../types'
import { getEdgeOutwardNormal } from '../../utils/geometry'
import type { Point } from '../../utils/geometry'

const MIN_ENTRANCE_WIDTH = 0.05  // world units
const HANDLE_HIT_PX = 22         // square hit area around each end handle, screen pixels
const ENTRANCE_COLOR = '#27AE60' // solid green — distinct from the dashed wall color, visible on a light canvas

const round2 = (v: number): number => Math.round(v * 100) / 100

interface Seg { offset: number; width: number }
interface EdgeUnit { p1: Point; ux: number; uy: number; length: number }

function edgeUnit(outline: Point[], edgeIndex: number): EdgeUnit | null {
  if (edgeIndex < 0 || edgeIndex >= outline.length) return null
  const p1 = outline[edgeIndex]
  const p2 = outline[(edgeIndex + 1) % outline.length]
  const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (length === 0) return null
  return { p1, ux: (p2.x - p1.x) / length, uy: (p2.y - p1.y) / length, length }
}

const pointAt = (edge: EdgeUnit, dist: number): Point => ({ x: edge.p1.x + edge.ux * dist, y: edge.p1.y + edge.uy * dist })
/** World distance along the edge (dot product) for a world point — the inverse of pointAt */
const distAt = (edge: EdgeUnit, p: Point): number => (p.x - edge.p1.x) * edge.ux + (p.y - edge.p1.y) * edge.uy

// ─── EntranceMarker ─────────────────────────────────────────────────────────
//
// An entrance is never a free object — its geometry is entirely derived from
// its host outline edge plus an offset/width along that edge. All three
// interactions (slide the body, resize from either end) are axis-locked drags
// that mutate the Konva nodes directly while in progress (same
// no-React-during-drag pattern as WallRect) and commit once on drag end.

function EntranceMarker({ entrance, outline }: { entrance: Entrance; outline: Point[] }): React.ReactElement | null {
  const { selectedEntranceId, selectEntrance, moveEntrance, resizeEntrance } = useCanvasStore()
  const { pixelsPerUnit: ppu } = useProjectStore()
  const wallThickness = useProjectStore((s) => s.settings?.perimeterThickness[entrance.edgeIndex] ?? 0)
  const { zoom } = useUiStore()

  const lineRef    = useRef<Konva.Line>(null)
  const handleARef = useRef<Konva.Group>(null)
  const handleBRef = useRef<Konva.Group>(null)
  const dragStart  = useRef<Seg | null>(null)

  const edge = edgeUnit(outline, entrance.edgeIndex)
  if (!edge) return null

  const normal = getEdgeOutwardNormal(outline, entrance.edgeIndex)
  const isSelected = selectedEntranceId === entrance.id
  const horizontal = Math.abs(edge.ux) >= Math.abs(edge.uy)

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string): void => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  /** Push a geometry onto the Konva nodes directly (no React involvement). */
  const applyGeom = useCallback((seg: Seg): void => {
    const a = pointAt(edge!, seg.offset)
    const b = pointAt(edge!, seg.offset + seg.width)
    const outerA = { x: a.x + normal.x * wallThickness, y: a.y + normal.y * wallThickness }
    const outerB = { x: b.x + normal.x * wallThickness, y: b.y + normal.y * wallThickness }
    lineRef.current?.points([
      a.x * ppu, a.y * ppu, b.x * ppu, b.y * ppu,
      outerB.x * ppu, outerB.y * ppu, outerA.x * ppu, outerA.y * ppu
    ])
    handleARef.current?.position({ x: a.x * ppu, y: a.y * ppu })
    handleBRef.current?.position({ x: b.x * ppu, y: b.y * ppu })
    lineRef.current?.getLayer()?.batchDraw()
  }, [edge, ppu, normal.x, normal.y, wallThickness])

  // ── Slide: drag the body along the edge's own axis ──────────────────────────

  const bodyDragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    const start = dragStart.current
    if (!start) return pos
    const { panX, panY, zoom: z } = useUiStore.getState()
    const a = pointAt(edge!, start.offset)
    return horizontal ? { x: pos.x, y: a.y * ppu * z + panY } : { x: a.x * ppu * z + panX, y: pos.y }
  }, [edge, horizontal, ppu])

  const handleBodyDragStart = useCallback((): void => {
    dragStart.current = { offset: entrance.offset, width: entrance.width }
    selectEntrance(entrance.id)
  }, [entrance.offset, entrance.width, entrance.id, selectEntrance])

  const readDraggedDist = (node: Konva.Node): number => {
    const worldPos = { x: node.x() / ppu, y: node.y() / ppu }
    return distAt(edge!, worldPos)
  }

  const handleBodyDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    if (!start) return
    const clamped = Math.min(Math.max(readDraggedDist(e.target), 0), edge!.length - start.width)
    applyGeom({ offset: clamped, width: start.width })
  }, [edge, applyGeom])

  const handleBodyDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    dragStart.current = null
    if (!start) return
    const clamped = round2(Math.min(Math.max(readDraggedDist(e.target), 0), edge!.length - start.width))
    applyGeom({ offset: clamped, width: start.width })
    moveEntrance(entrance.id, clamped)
  }, [edge, applyGeom, moveEntrance, entrance.id])

  // ── Resize: drag either end handle ──────────────────────────────────────────

  const handleResizeStart = useCallback((): void => {
    dragStart.current = { offset: entrance.offset, width: entrance.width }
    selectEntrance(entrance.id)
  }, [entrance.offset, entrance.width, entrance.id, selectEntrance])

  const handleAMove = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    if (!start) return
    const far = start.offset + start.width
    const clamped = Math.min(Math.max(readDraggedDist(e.target), 0), far - MIN_ENTRANCE_WIDTH)
    applyGeom({ offset: clamped, width: far - clamped })
  }, [applyGeom])

  const handleAEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    dragStart.current = null
    if (!start) return
    const far = start.offset + start.width
    const clamped = round2(Math.min(Math.max(readDraggedDist(e.target), 0), far - MIN_ENTRANCE_WIDTH))
    const seg = { offset: clamped, width: round2(far - clamped) }
    applyGeom(seg)
    resizeEntrance(entrance.id, seg.offset, seg.width)
  }, [applyGeom, resizeEntrance, entrance.id])

  const handleBMove = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    if (!start) return
    const clampedWidth = Math.min(Math.max(readDraggedDist(e.target) - start.offset, MIN_ENTRANCE_WIDTH), edge!.length - start.offset)
    applyGeom({ offset: start.offset, width: clampedWidth })
  }, [edge, applyGeom])

  const handleBEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    const start = dragStart.current
    dragStart.current = null
    if (!start) return
    const clampedWidth = round2(Math.min(Math.max(readDraggedDist(e.target) - start.offset, MIN_ENTRANCE_WIDTH), edge!.length - start.offset))
    applyGeom({ offset: start.offset, width: clampedWidth })
    resizeEntrance(entrance.id, start.offset, clampedWidth)
  }, [edge, applyGeom, resizeEntrance, entrance.id])

  // ── Render ──────────────────────────────────────────────────────────────────

  const a = pointAt(edge, entrance.offset)
  const b = pointAt(edge, entrance.offset + entrance.width)
  const outerA = { x: a.x + normal.x * wallThickness, y: a.y + normal.y * wallThickness }
  const outerB = { x: b.x + normal.x * wallThickness, y: b.y + normal.y * wallThickness }
  const hitSize = HANDLE_HIT_PX / zoom

  return (
    <>
      {/* Fills the full wall thickness at this edge, so the opening reads as a
          break in the wall rather than a marker line sitting on top of it. */}
      <Line
        ref={lineRef}
        points={[
          a.x * ppu, a.y * ppu, b.x * ppu, b.y * ppu,
          outerB.x * ppu, outerB.y * ppu, outerA.x * ppu, outerA.y * ppu
        ]}
        closed
        fill={ENTRANCE_COLOR}
        stroke={isSelected ? ENTRANCE_COLOR : undefined}
        strokeWidth={isSelected ? 2 / zoom : 0}
        shadowColor={isSelected ? ENTRANCE_COLOR : 'transparent'}
        shadowBlur={isSelected ? 8 / zoom : 0}
        shadowOpacity={0.6}
        onClick={(e) => { e.cancelBubble = true; selectEntrance(entrance.id) }}
        onTap={(e) => { e.cancelBubble = true; selectEntrance(entrance.id) }}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />
      {/* Body — invisible draggable hit strip for sliding the whole entrance along the edge */}
      <Group
        x={a.x * ppu} y={a.y * ppu}
        draggable
        dragBoundFunc={bodyDragBoundFunc}
        onDragStart={handleBodyDragStart}
        onDragMove={handleBodyDragMove}
        onDragEnd={handleBodyDragEnd}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      >
        <Rect
          x={horizontal ? Math.min(0, (b.x - a.x) * ppu) : -hitSize / 2}
          y={horizontal ? -hitSize / 2 : Math.min(0, (b.y - a.y) * ppu)}
          width={horizontal ? Math.abs(b.x - a.x) * ppu : hitSize}
          height={horizontal ? hitSize : Math.abs(b.y - a.y) * ppu}
          fill="transparent"
        />
      </Group>
      {isSelected && (
        <>
          <Group
            ref={handleARef}
            x={a.x * ppu} y={a.y * ppu}
            draggable
            onDragStart={handleResizeStart}
            onDragMove={handleAMove}
            onDragEnd={handleAEnd}
            onMouseEnter={(e) => setCursor(e, horizontal ? 'ew-resize' : 'ns-resize')}
            onMouseLeave={(e) => setCursor(e, 'default')}
          >
            <Rect x={-hitSize / 2} y={-hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
            <Rect x={-2 / zoom} y={-hitSize / 2} width={4 / zoom} height={hitSize} fill={ENTRANCE_COLOR} cornerRadius={2 / zoom} />
          </Group>
          <Group
            ref={handleBRef}
            x={b.x * ppu} y={b.y * ppu}
            draggable
            onDragStart={handleResizeStart}
            onDragMove={handleBMove}
            onDragEnd={handleBEnd}
            onMouseEnter={(e) => setCursor(e, horizontal ? 'ew-resize' : 'ns-resize')}
            onMouseLeave={(e) => setCursor(e, 'default')}
          >
            <Rect x={-hitSize / 2} y={-hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
            <Rect x={-2 / zoom} y={-hitSize / 2} width={4 / zoom} height={hitSize} fill={ENTRANCE_COLOR} cornerRadius={2 / zoom} />
          </Group>
        </>
      )}
    </>
  )
}

// ─── EntranceLayer ────────────────────────────────────────────────────────────

export default function EntranceLayer(): React.ReactElement {
  const { entrances } = useCanvasStore()
  const outline = useProjectStore((s) => s.settings?.storeOutline)
  if (!outline) return <Layer />
  return (
    <Layer>
      {entrances.map(e => <EntranceMarker key={e.id} entrance={e} outline={outline} />)}
    </Layer>
  )
}
