import React, { useRef, useCallback } from 'react'
import { Layer, Rect, Group, Shape, Line } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { computeAlignmentSnap, computeSnap, updateGuides, GUIDE_THRESHOLD_PX } from './FixtureLayer'
import type { AlignBox } from './FixtureLayer'
import { WALL_COLOR } from '../../types'
import type { Wall } from '../../types'
import { isWallSideFlushWithOutline, wallSideTouchesOtherWalls, rectsOverlap, rectInsidePolygon } from '../../utils/geometry'

const MIN_WALL_SIZE = 0.05   // world units
const ARROW_SIZE_PX = 10     // arrow glyph size, screen pixels
const HANDLE_HIT_PX = 26     // square hit area around each handle, screen pixels

/** An interior wall can't overlap another wall or a fixture, or leave the store's perimeter (world units) */
function wallPlacementBlocked(
  rect: { x: number; y: number; width: number; height: number },
  excludeWallId: string
): boolean {
  const { walls, fixtures } = useCanvasStore.getState()
  if (walls.some((w) => w.id !== excludeWallId && rectsOverlap(rect, w))) return true
  if (fixtures.some((f) => rectsOverlap(rect, f))) return true
  const outline = useProjectStore.getState().settings?.storeOutline
  return outline ? !rectInsidePolygon(rect, outline) : false
}

type HandleSide = 'left' | 'right' | 'top' | 'bottom'
const SIDES: HandleSide[] = ['left', 'right', 'top', 'bottom']

interface Geom {
  x: number
  y: number
  w: number
  h: number
}

const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Centre of a resize handle in content px, relative to a group whose origin
 * sits at world position `origin` (the wall's position when the drag began).
 */
function handleCentre(
  side: HandleSide,
  geom: Geom,
  origin: { x: number; y: number },
  ppu: number
): { x: number; y: number } {
  const ox = (geom.x - origin.x) * ppu
  const oy = (geom.y - origin.y) * ppu
  const w = geom.w * ppu
  const h = geom.h * ppu
  switch (side) {
    case 'left':   return { x: ox,         y: oy + h / 2 }
    case 'right':  return { x: ox + w,     y: oy + h / 2 }
    case 'top':    return { x: ox + w / 2, y: oy }
    case 'bottom': return { x: ox + w / 2, y: oy + h }
  }
}

/**
 * Single-axis alignment snap for a resize drag. Unlike a move-drag (where the
 * whole box slides and 3 sample points matter per axis), a resize only moves
 * one edge — so we compare just that edge's coordinate against every other
 * object's near edge, far edge, and centre on the same axis.
 */
function computeEdgeAlignmentSnap(
  dynamicEdge: number,
  others: AlignBox[],
  axis: 'x' | 'y',
  zoom: number,
  pixelsPerUnit: number
): { edge: number; guide: number | null } {
  const threshold = GUIDE_THRESHOLD_PX / (zoom * pixelsPerUnit)
  let best: { edge: number; dist: number } | null = null

  for (const o of others) {
    const near = axis === 'x' ? o.x : o.y
    const far  = axis === 'x' ? o.x + o.width : o.y + o.height
    const mid  = (near + far) / 2
    for (const target of [near, far, mid]) {
      const dist = Math.abs(dynamicEdge - target)
      if (dist < threshold && (!best || dist < best.dist)) {
        best = { edge: target, dist }
      }
    }
  }

  return best ? { edge: best.edge, guide: best.edge } : { edge: dynamicEdge, guide: null }
}

/** Arrow glyph pointing outward from the wall edge, drawn just outside it. */
function makeArrowSceneFunc(side: HandleSide, s: number) {
  return (ctx: Konva.Context, shape: Konva.Shape): void => {
    const gap = s * 0.35
    const head = s * 0.4
    ctx.beginPath()
    if (side === 'left') {
      ctx.moveTo(-gap, 0); ctx.lineTo(-gap - s, 0)
      ctx.moveTo(-gap - s + head, -head); ctx.lineTo(-gap - s, 0); ctx.lineTo(-gap - s + head, head)
    } else if (side === 'right') {
      ctx.moveTo(gap, 0); ctx.lineTo(gap + s, 0)
      ctx.moveTo(gap + s - head, -head); ctx.lineTo(gap + s, 0); ctx.lineTo(gap + s - head, head)
    } else if (side === 'top') {
      ctx.moveTo(0, -gap); ctx.lineTo(0, -gap - s)
      ctx.moveTo(-head, -gap - s + head); ctx.lineTo(0, -gap - s); ctx.lineTo(head, -gap - s + head)
    } else {
      ctx.moveTo(0, gap); ctx.lineTo(0, gap + s)
      ctx.moveTo(-head, gap + s - head); ctx.lineTo(0, gap + s); ctx.lineTo(head, gap + s - head)
    }
    ctx.fillStrokeShape(shape)
  }
}

// ─── WallRect ─────────────────────────────────────────────────────────────────
//
// The wall body and its four resize handles live inside one draggable Group,
// so moving the wall moves the handles in real time. During a handle drag the
// store is NOT updated — the rect and handles are mutated directly on the
// Konva nodes (same pattern as the alignment guides) and the final geometry
// is committed once on drag end. This keeps React re-renders out of the drag
// loop entirely, which is what caused the drift and jumping before.

function WallRect({ wall }: { wall: Wall }): React.ReactElement {
  const { selectWall, moveWall, resizeWall, selectedWallId, walls } = useCanvasStore()
  const { pixelsPerUnit: ppu, settings } = useProjectStore()
  const { gridMode, zoom } = useUiStore()

  const groupRef  = useRef<Konva.Group>(null)
  const rectRef   = useRef<Konva.Rect>(null)
  const borderRefs = useRef<Record<HandleSide, Konva.Line | null>>({
    left: null, right: null, top: null, bottom: null
  })
  const handleRefs = useRef<Record<HandleSide, Konva.Group | null>>({
    left: null, right: null, top: null, bottom: null
  })
  /** Wall geometry when a resize drag started (group origin stays here during the drag) */
  const resizeStart = useRef<Geom | null>(null)
  /** Live geometry during a resize drag, committed on drag end */
  const resizeGeom = useRef<Geom | null>(null)
  /** Last known-valid geometry during a resize drag — growth that would hit something sticks here instead of overshooting */
  const lastValidResizeGeom = useRef<Geom | null>(null)
  /** Last known-valid position (world units) during a move drag — sliding into something sticks here instead of passing through */
  const lastValidPos = useRef<{ x: number; y: number }>({ x: wall.x, y: wall.y })

  const isSelected = selectedWallId === wall.id
  const px = wall.x * ppu
  const py = wall.y * ppu
  const pw = wall.width * ppu
  const ph = wall.height * ppu
  const restGeom: Geom = { x: wall.x, y: wall.y, w: wall.width, h: wall.height }

  // A side flush against the store's perimeter, or touching/overlapping
  // another wall, draws no border of its own — the other side suppresses its
  // outline at the same join too (see PerimeterWallLayer, and the wall-vs-wall
  // check below) so the fills read as one continuous surface instead of two
  // separately-outlined shapes stacked on each other.
  const outline = settings?.storeOutline
  const otherWalls = walls.filter((w) => w.id !== wall.id)
  const touches: Record<HandleSide, boolean> = {
    left:   (outline ? isWallSideFlushWithOutline(outline, wall.x, wall.y, wall.y + wall.height, false) : false)
      || wallSideTouchesOtherWalls(wall.x, wall.y, wall.y + wall.height, false, otherWalls),
    right:  (outline ? isWallSideFlushWithOutline(outline, wall.x + wall.width, wall.y, wall.y + wall.height, false) : false)
      || wallSideTouchesOtherWalls(wall.x + wall.width, wall.y, wall.y + wall.height, false, otherWalls),
    top:    (outline ? isWallSideFlushWithOutline(outline, wall.y, wall.x, wall.x + wall.width, true) : false)
      || wallSideTouchesOtherWalls(wall.y, wall.x, wall.x + wall.width, true, otherWalls),
    bottom: (outline ? isWallSideFlushWithOutline(outline, wall.y + wall.height, wall.x, wall.x + wall.width, true) : false)
      || wallSideTouchesOtherWalls(wall.y + wall.height, wall.x, wall.x + wall.width, true, otherWalls)
  }

  // A border line overshoots past a given corner only when the side sharing
  // that corner is itself suppressed (touching the perimeter or another
  // wall) — that's when there's no line from this wall meeting it there, so
  // the overshoot bridges a hairline antialiasing gap against the
  // neighboring geometry's own rendering. When both sides at a corner are
  // visible, they meet exactly at the corner with no overshoot; overshooting
  // there too would just double-stroke a small square at every corner.
  const cornerExtents = (side: HandleSide, ext: number): [number, number] => {
    switch (side) {
      case 'left':
      case 'right':
        return [touches.top ? ext : 0, touches.bottom ? ext : 0]
      case 'top':
      case 'bottom':
        return [touches.left ? ext : 0, touches.right ? ext : 0]
    }
  }

  const borderPoints = (side: HandleSide, w: number, h: number, ext: number): number[] => {
    const [extStart, extEnd] = cornerExtents(side, ext)
    switch (side) {
      case 'left':   return [0, -extStart, 0, h + extEnd]
      case 'right':  return [w, -extStart, w, h + extEnd]
      case 'top':    return [-extStart, 0, w + extEnd, 0]
      case 'bottom': return [-extStart, h, w + extEnd, h]
    }
  }

  // Grows the wall's fill by a hairline on any side flush against another
  // wall — two independently-antialiased same-color fills that only just
  // touch still leave a faint background-colored seam at the join (the same
  // problem PerimeterWallLayer's own patch solves for wall-vs-perimeter).
  // `x`/`y` are the rect's own pre-patch offset (0 except mid-resize, where a
  // left/top-edge drag shifts the rect within the group).
  const fillPatch = (x: number, y: number, w: number, h: number, patch: number): { x: number; y: number; width: number; height: number } => {
    const l = touches.left ? patch : 0
    const r = touches.right ? patch : 0
    const t = touches.top ? patch : 0
    const b = touches.bottom ? patch : 0
    return { x: x - l, y: y - t, width: w + l + r, height: h + t + b }
  }

  // ── Move: group drag ────────────────────────────────────────────────────────

  // dragBoundFunc works in absolute (stage-container) pixels: abs = content × zoom + pan.
  // A candidate position that would overlap another wall/fixture or leave the
  // perimeter is rejected on the spot — the wall sticks at the last valid spot
  // instead of passing through and only snapping back once the drag ends.
  const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
    const { panX, panY, zoom: z } = useUiStore.getState()
    let worldX: number, worldY: number, guideY: number | null = null, guideX: number | null = null

    if (gridMode === 'off') {
      // Free drag — snap to alignment guides against other walls and fixtures,
      // same behaviour as fixture dragging.
      const { fixtures, walls } = useCanvasStore.getState()
      const others: AlignBox[] = [...fixtures, ...walls.filter(w => w.id !== wall.id)]
      const rawX = (pos.x - panX) / (z * ppu)
      const rawY = (pos.y - panY) / (z * ppu)
      const result = computeAlignmentSnap(rawX, rawY, wall.width, wall.height, others, z, ppu)
      worldX = result.x
      worldY = result.y
      guideY = result.guideY
      guideX = result.guideX
    } else {
      // Grid drag — corner-to-corner magnet against other walls first (same
      // behaviour as fixture dragging), falling back to the plain grid when
      // nothing's close enough.
      const { gridSizePx: gsz } = useProjectStore.getState()
      const otherWalls = useCanvasStore.getState().walls.filter(w => w.id !== wall.id)
      const snapped = computeSnap(pos.x, pos.y, wall.width * ppu, wall.height * ppu, otherWalls, ppu, gsz, z, panX, panY)
      worldX = (snapped.x - panX) / (z * ppu)
      worldY = (snapped.y - panY) / (z * ppu)
    }

    if (wallPlacementBlocked({ x: worldX, y: worldY, width: wall.width, height: wall.height }, wall.id)) {
      const last = lastValidPos.current
      return { x: last.x * ppu * z + panX, y: last.y * ppu * z + panY }
    }

    lastValidPos.current = { x: worldX, y: worldY }
    updateGuides(guideY, guideX)
    return { x: worldX * ppu * z + panX, y: worldY * ppu * z + panY }
  }, [gridMode, wall.id, wall.width, wall.height, ppu])

  const handleGroupDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    if (e.target !== groupRef.current) return  // bubbled from a resize handle
    lastValidPos.current = { x: wall.x, y: wall.y }
    if (useCanvasStore.getState().selectedWallId !== wall.id) selectWall(wall.id)
  }, [wall.id, wall.x, wall.y, selectWall])

  const handleGroupDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    if (e.target !== groupRef.current) return  // bubbled from a resize handle
    updateGuides(null, null)
    // dragBoundFunc already guaranteed every position along the way was valid,
    // so the node's current position can be committed as-is.
    const node = e.target
    const wx = round2(node.x() / ppu)
    const wy = round2(node.y() / ppu)
    node.position({ x: wx * ppu, y: wy * ppu })
    moveWall(wall.id, wx, wy)
  }, [wall.id, ppu, moveWall])

  // ── Resize: handle drag ─────────────────────────────────────────────────────

  /** Push a geometry onto the Konva nodes directly (no React involvement). */
  const applyGeom = useCallback((geom: Geom, origin: { x: number; y: number }): void => {
    const x = (geom.x - origin.x) * ppu
    const y = (geom.y - origin.y) * ppu
    const w = geom.w * ppu
    const h = geom.h * ppu
    const ext = 1.5 / useUiStore.getState().zoom
    rectRef.current?.setAttrs(fillPatch(x, y, w, h, ext))
    for (const side of SIDES) {
      handleRefs.current[side]?.position(handleCentre(side, geom, origin, ppu))
      borderRefs.current[side]?.setAttrs({ x, y, points: borderPoints(side, w, h, ext) })
    }
    groupRef.current?.getLayer()?.batchDraw()
  }, [ppu, touches.left, touches.right, touches.top, touches.bottom])

  const handleResizeStart = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    updateGuides(null, null)
    resizeStart.current = { x: wall.x, y: wall.y, w: wall.width, h: wall.height }
    resizeGeom.current = { ...resizeStart.current }
    lastValidResizeGeom.current = { ...resizeStart.current }
  }, [wall.x, wall.y, wall.width, wall.height])

  const handleResizeMove = useCallback((side: HandleSide, e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    const start = resizeStart.current
    if (!start) return
    const node = e.target as Konva.Group

    const axis: 'x' | 'y' = (side === 'left' || side === 'right') ? 'x' : 'y'
    // node.x()/y() are relative to the wall group, whose origin sits at the
    // drag-start position — so world edge = start + node position / ppu
    const rawEdge = axis === 'x' ? start.x + node.x() / ppu : start.y + node.y() / ppu

    const gm = useUiStore.getState().gridMode
    let snappedEdge: number
    let guideX: number | null = null
    let guideY: number | null = null

    if (gm !== 'off') {
      const { gridSizePx: gsz } = useProjectStore.getState()
      const snapWorld = gsz / ppu
      snappedEdge = Math.round(rawEdge / snapWorld) * snapWorld
    } else {
      const { zoom: z } = useUiStore.getState()
      const { fixtures, walls } = useCanvasStore.getState()
      const others: AlignBox[] = [...fixtures, ...walls.filter(w => w.id !== wall.id)]
      const result = computeEdgeAlignmentSnap(rawEdge, others, axis, z, ppu)
      snappedEdge = result.edge
      if (axis === 'x') guideX = result.guide
      else guideY = result.guide
    }
    updateGuides(guideY, guideX)

    const g: Geom = { ...resizeGeom.current! }
    if (side === 'right') {
      const edge = Math.max(snappedEdge, start.x + MIN_WALL_SIZE)
      g.w = round2(edge - start.x)
    } else if (side === 'left') {
      const right = start.x + start.w
      const edge = Math.min(snappedEdge, right - MIN_WALL_SIZE)
      g.x = round2(edge)
      g.w = round2(right - edge)
    } else if (side === 'bottom') {
      const edge = Math.max(snappedEdge, start.y + MIN_WALL_SIZE)
      g.h = round2(edge - start.y)
    } else {
      const bottom = start.y + start.h
      const edge = Math.min(snappedEdge, bottom - MIN_WALL_SIZE)
      g.y = round2(edge)
      g.h = round2(bottom - edge)
    }
    // A growth step that would overlap another wall/fixture or leave the
    // perimeter is rejected on the spot — the edge sticks at the last valid
    // size instead of overshooting and only snapping back once the drag ends.
    const target = wallPlacementBlocked({ x: g.x, y: g.y, width: g.w, height: g.h }, wall.id)
      ? lastValidResizeGeom.current!
      : g
    if (target === g) lastValidResizeGeom.current = g
    resizeGeom.current = target
    // Repositions the dragged handle too — this is what enforces the axis
    // lock and snapping (standard Konva pattern: override position in dragmove)
    applyGeom(target, start)
  }, [ppu, applyGeom, wall.id])

  const handleResizeEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    updateGuides(null, null)
    const g = resizeGeom.current
    resizeStart.current = null
    resizeGeom.current = null
    lastValidResizeGeom.current = null
    if (!g) return
    // dragmove already guaranteed this geometry was valid, so it can be
    // committed as-is. Normalize nodes to the at-rest layout (group at wall
    // origin, rect at 0,0) BEFORE committing, so node state matches what
    // React will render — props that happen to be unchanged won't be
    // re-applied by react-konva.
    groupRef.current?.position({ x: g.x * ppu, y: g.y * ppu })
    const ext = 1.5 / useUiStore.getState().zoom
    rectRef.current?.setAttrs(fillPatch(0, 0, g.w * ppu, g.h * ppu, ext))
    for (const side of SIDES) {
      handleRefs.current[side]?.position(handleCentre(side, g, g, ppu))
      borderRefs.current[side]?.setAttrs({ x: 0, y: 0, points: borderPoints(side, g.w * ppu, g.h * ppu, ext) })
    }
    resizeWall(wall.id, g.x, g.y, g.w, g.h)
  }, [wall.id, ppu, resizeWall, touches.left, touches.right, touches.top, touches.bottom])

  // ── Render ──────────────────────────────────────────────────────────────────

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string): void => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  const arrowSize = ARROW_SIZE_PX / zoom
  const hitSize = HANDLE_HIT_PX / zoom

  return (
    <Group
      ref={groupRef}
      x={px}
      y={py}
      draggable
      dragBoundFunc={dragBoundFunc}
      onDragStart={handleGroupDragStart}
      onDragEnd={handleGroupDragEnd}
      onClick={(e) => { e.cancelBubble = true; selectWall(wall.id) }}
      onTap={(e) => { e.cancelBubble = true; selectWall(wall.id) }}
    >
      {/* Interior walls take real floor space, unlike the perimeter (which is
          just a zero-footprint reference line) — so thickness needs to read
          clearly as solid, occupied space rather than a thin outline. The
          fill is grown by a hairline on any side flush against another wall
          — see fillPatch — to bridge the antialiasing seam that would
          otherwise show between two separately-rendered same-color fills. */}
      <Rect
        ref={rectRef}
        {...fillPatch(0, 0, pw, ph, 1.5 / zoom)}
        fill={WALL_COLOR}
        shadowColor={isSelected ? WALL_COLOR : 'transparent'}
        shadowBlur={isSelected ? 8 / zoom : 0}
        shadowOpacity={0.6}
        onMouseEnter={(e) => setCursor(e, 'move')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />
      {SIDES.filter((side) => !touches[side]).map((side) => (
        <Line
          key={side}
          ref={(n) => { borderRefs.current[side] = n }}
          x={0} y={0}
          points={borderPoints(side, pw, ph, 1.5 / zoom)}
          stroke={isSelected ? '#ffffff' : '#000000'}
          strokeWidth={1.5 / zoom}
          listening={false}
        />
      ))}
      {isSelected && SIDES.map((side) => {
        const c = handleCentre(side, restGeom, restGeom, ppu)
        const isHoriz = side === 'left' || side === 'right'
        return (
          <Group
            key={side}
            ref={(n) => { handleRefs.current[side] = n }}
            x={c.x}
            y={c.y}
            draggable
            onDragStart={handleResizeStart}
            onDragMove={(e) => handleResizeMove(side, e)}
            onDragEnd={handleResizeEnd}
            onMouseEnter={(e) => setCursor(e, isHoriz ? 'ew-resize' : 'ns-resize')}
            onMouseLeave={(e) => setCursor(e, 'default')}
          >
            <Rect
              x={-hitSize / 2}
              y={-hitSize / 2}
              width={hitSize}
              height={hitSize}
              fill="transparent"
            />
            <Shape
              sceneFunc={makeArrowSceneFunc(side, arrowSize)}
              stroke={WALL_COLOR}
              strokeWidth={2 / zoom}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          </Group>
        )
      })}
    </Group>
  )
}

// ─── WallLayer ────────────────────────────────────────────────────────────────

export default function WallLayer(): React.ReactElement {
  const { walls } = useCanvasStore()
  return (
    <Layer>
      {walls.map(w => <WallRect key={w.id} wall={w} />)}
    </Layer>
  )
}
