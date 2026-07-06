import React, { useRef, useCallback, useEffect } from 'react'
import { Layer, Shape, Group, Rect } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { WALL_COLOR } from '../../types'
import {
  offsetRectilinearPolygonOutward, getEdgeOutwardNormal, projectOntoSegment,
  wallCoveredIntervals, invertIntervals, FLUSH_EPS
} from '../../utils/geometry'
import type { Point } from '../../utils/geometry'

const HANDLE_HIT_PX = 22
const MIN_THICKNESS = 0.02  // world units

const round2 = (v: number): number => Math.round(v * 100) / 100

const pointAt = (p1: Point, p2: Point, length: number, t: number): Point => {
  const ux = (p2.x - p1.x) / length, uy = (p2.y - p1.y) / length
  return { x: p1.x + ux * t, y: p1.y + uy * t }
}

// ─── ThicknessHandle ────────────────────────────────────────────────────────
//
// One square handle on the outer face of the currently-selected perimeter
// edge. Resizing is strictly hold-to-drag: mousedown on the handle attaches
// window-level mousemove/mouseup listeners (the same pattern StoreCanvas
// already uses for panning and rubber-band selection) — NOT Konva's drag
// system. The moment the left button is released the resize stops and
// commits; a `buttons === 0` guard also self-heals if the release happened
// outside the window, so the handle can never get stuck following the mouse.

function ThicknessHandle({
  edgeIndex, outline, thickness, ppu, zoom, onLiveChange, onCommit
}: {
  edgeIndex: number
  outline: Point[]
  thickness: number
  ppu: number
  zoom: number
  onLiveChange: (edgeIndex: number, thickness: number) => void
  onCommit: (edgeIndex: number, thickness: number) => void
}): React.ReactElement {
  const groupRef = useRef<Konva.Group>(null)
  const detachRef = useRef<(() => void) | null>(null)

  const p1 = outline[edgeIndex]
  const p2 = outline[(edgeIndex + 1) % outline.length]
  const mid: Point = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const normal = getEdgeOutwardNormal(outline, edgeIndex)
  const dragAlongX = normal.x !== 0  // normal is horizontal → the edge itself is vertical

  // Detach window listeners if the handle unmounts mid-hold (edge deselected)
  useEffect(() => () => detachRef.current?.(), [])

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (e.evt.button !== 0) return
    e.cancelBubble = true
    e.evt.preventDefault()
    const start = { clientX: e.evt.clientX, clientY: e.evt.clientY, thickness, mid, normal }

    const thicknessAt = (ev: MouseEvent): number => {
      const { zoom: z } = useUiStore.getState()
      const dx = (ev.clientX - start.clientX) / (z * ppu)
      const dy = (ev.clientY - start.clientY) / (z * ppu)
      return Math.max(MIN_THICKNESS, start.thickness + dx * start.normal.x + dy * start.normal.y)
    }
    const apply = (t: number): void => {
      groupRef.current?.position({ x: (start.mid.x + start.normal.x * t) * ppu, y: (start.mid.y + start.normal.y * t) * ppu })
      onLiveChange(edgeIndex, t)
    }
    const detach = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', finish)
      detachRef.current = null
    }
    const finish = (ev: MouseEvent): void => {
      detach()
      const t = round2(thicknessAt(ev))
      apply(t)
      onCommit(edgeIndex, t)
    }
    const onMove = (ev: MouseEvent): void => {
      if (ev.buttons === 0) { finish(ev); return }
      apply(thicknessAt(ev))
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finish)
    detachRef.current = detach
  }, [thickness, mid.x, mid.y, normal.x, normal.y, ppu, edgeIndex, onLiveChange, onCommit])

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string): void => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  const hitSize = HANDLE_HIT_PX / zoom

  return (
    <Group
      ref={groupRef}
      x={(mid.x + normal.x * thickness) * ppu}
      y={(mid.y + normal.y * thickness) * ppu}
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => setCursor(e, dragAlongX ? 'ew-resize' : 'ns-resize')}
      onMouseLeave={(e) => setCursor(e, 'default')}
    >
      <Rect x={-hitSize / 2} y={-hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
      <Rect
        x={-hitSize / 4} y={-hitSize / 4} width={hitSize / 2} height={hitSize / 2}
        fill="#ffffff" stroke={WALL_COLOR} strokeWidth={1.5 / zoom} cornerRadius={3 / zoom}
      />
    </Group>
  )
}

// ─── PerimeterWallLayer ─────────────────────────────────────────────────────
//
// Renders the store's perimeter as a variable-width border band: the inner
// edge is always storeOutline itself (the true, unchanged interior boundary
// that fixture/wall containment checks are computed against), the outer edge
// is that same polygon offset outward per-edge by settings.perimeterThickness.
// Thickness only ever grows outward, so floor space is untouched.
//
// Everything is painted in one custom Shape so a live thickness drag only has
// to mutate thicknessRef and batchDraw (no React re-render per frame). The
// band ring is filled by tracing the outer polygon and the inner polygon in
// OPPOSITE winding orders — a nonzero-rule ring that needs no fillRule
// support, which matters because Konva's hit canvas ignores fillRule: an
// evenodd ring would hit-test as the whole solid polygon, making every click
// on the store floor land on the band instead of the empty stage (this is
// exactly what made perimeter selection impossible to escape).

export default function PerimeterWallLayer(): React.ReactElement {
  const settings = useProjectStore((s) => s.settings)
  const ppu = useProjectStore((s) => s.pixelsPerUnit)
  const zoom = useUiStore((s) => s.zoom)
  const walls = useCanvasStore((s) => s.walls)
  const selectedPerimeterEdge = useCanvasStore((s) => s.selectedPerimeterEdge)
  const selectPerimeterEdge = useCanvasStore((s) => s.selectPerimeterEdge)

  const shapeRef = useRef<Konva.Shape>(null)
  const thicknessRef = useRef<number[]>(settings?.perimeterThickness ?? [])

  useEffect(() => {
    thicknessRef.current = [...(settings?.perimeterThickness ?? [])]
    shapeRef.current?.getLayer()?.batchDraw()
  }, [settings?.perimeterThickness])

  const onLiveChange = useCallback((edgeIndex: number, thickness: number): void => {
    thicknessRef.current[edgeIndex] = thickness
    shapeRef.current?.getLayer()?.batchDraw()
  }, [])

  const onCommit = useCallback((edgeIndex: number, thickness: number): void => {
    useProjectStore.getState().setPerimeterEdgeThickness(edgeIndex, thickness)
  }, [])

  if (!settings) return <Layer />
  const { storeOutline } = settings

  const tracePoly = (ctx: Konva.Context, pts: Point[], reverse = false): void => {
    const n = pts.length
    for (let k = 0; k < n; k++) {
      const p = pts[reverse ? n - 1 - k : k]
      if (k === 0) ctx.moveTo(p.x * ppu, p.y * ppu)
      else ctx.lineTo(p.x * ppu, p.y * ppu)
    }
    ctx.closePath()
  }

  const traceBandRing = (ctx: Konva.Context): void => {
    ctx.beginPath()
    tracePoly(ctx, offsetRectilinearPolygonOutward(storeOutline, thicknessRef.current))
    tracePoly(ctx, storeOutline, true)  // reversed → opposite winding → nonzero-rule hole
  }

  const sceneFunc = (ctx: Konva.Context, shape: Konva.Shape): void => {
    const outer = offsetRectilinearPolygonOutward(storeOutline, thicknessRef.current)

    // Band fill (ring with a floor-shaped hole)
    traceBandRing(ctx)
    ctx.fillShape(shape)

    // Outer boundary — always a full, unbroken black outline
    ctx.beginPath()
    tracePoly(ctx, outer)
    ctx.strokeShape(shape)

    // Inner boundary, per edge: black outline everywhere EXCEPT where an
    // interior wall sits flush against it. The covered stretches instead get
    // a wall-colored patch straddling the boundary — the band and the wall
    // are two separately-rendered fills, and without the patch their
    // antialiased edges overlap into a faint 1px seam of background color.
    for (let i = 0; i < storeOutline.length; i++) {
      const p1 = storeOutline[i]
      const p2 = storeOutline[(i + 1) % storeOutline.length]
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (length === 0) continue
      const covered = wallCoveredIntervals(storeOutline, i, walls)

      if (covered.length > 0) {
        const normal = getEdgeOutwardNormal(storeOutline, i)
        // Reaches FLUSH_EPS inward (also bridging any sub-EPS placement gap,
        // hidden under the wall's own fill) and outward into the band, capped
        // by the band's actual thickness so it never spills past the outer line.
        const out = Math.min(FLUSH_EPS, thicknessRef.current[i] ?? 0)
        ctx.fillStyle = WALL_COLOR
        for (const [s, e] of covered) {
          const a = pointAt(p1, p2, length, s)
          const b = pointAt(p1, p2, length, e)
          ctx.beginPath()
          ctx.moveTo((a.x - normal.x * FLUSH_EPS) * ppu, (a.y - normal.y * FLUSH_EPS) * ppu)
          ctx.lineTo((b.x - normal.x * FLUSH_EPS) * ppu, (b.y - normal.y * FLUSH_EPS) * ppu)
          ctx.lineTo((b.x + normal.x * out) * ppu, (b.y + normal.y * out) * ppu)
          ctx.lineTo((a.x + normal.x * out) * ppu, (a.y + normal.y * out) * ppu)
          ctx.closePath()
          ctx.fill()
        }
      }

      const gaps = invertIntervals(covered, length)
      if (gaps.length > 0) {
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 2 / zoom
        ctx.beginPath()
        for (const [s, e] of gaps) {
          const a = pointAt(p1, p2, length, s)
          const b = pointAt(p1, p2, length, e)
          ctx.moveTo(a.x * ppu, a.y * ppu)
          ctx.lineTo(b.x * ppu, b.y * ppu)
        }
        ctx.stroke()
      }
    }
  }

  // Hit region = the band ring only. Without this, clicks anywhere on the
  // store floor would land on this shape and re-select an edge instead of
  // reaching the stage (whose click handler is what deselects).
  const hitFunc = (ctx: Konva.Context, shape: Konva.Shape): void => {
    traceBandRing(ctx)
    ctx.fillStrokeShape(shape)
  }

  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    e.cancelBubble = true
    const stage = e.target.getStage()
    const pos = stage?.getRelativePointerPosition()
    if (!pos) return
    const worldPt = { x: pos.x / ppu, y: pos.y / ppu }
    let best: { edgeIndex: number; distSq: number } | null = null
    for (let i = 0; i < storeOutline.length; i++) {
      const proj = projectOntoSegment(worldPt, storeOutline[i], storeOutline[(i + 1) % storeOutline.length])
      if (!best || proj.distSq < best.distSq) best = { edgeIndex: i, distSq: proj.distSq }
    }
    if (best) selectPerimeterEdge(best.edgeIndex)
  }, [storeOutline, ppu, selectPerimeterEdge])

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string): void => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  return (
    <Layer>
      <Shape
        ref={shapeRef}
        sceneFunc={sceneFunc}
        hitFunc={hitFunc}
        fill={WALL_COLOR}
        stroke="#000000"
        strokeWidth={2 / zoom}
        onClick={handleClick}
        onTap={handleClick}
        onMouseEnter={(e) => setCursor(e, 'pointer')}
        onMouseLeave={(e) => setCursor(e, 'default')}
      />
      {selectedPerimeterEdge !== null && selectedPerimeterEdge < storeOutline.length && (
        <ThicknessHandle
          edgeIndex={selectedPerimeterEdge}
          outline={storeOutline}
          thickness={settings.perimeterThickness[selectedPerimeterEdge] ?? MIN_THICKNESS}
          ppu={ppu}
          zoom={zoom}
          onLiveChange={onLiveChange}
          onCommit={onCommit}
        />
      )}
    </Layer>
  )
}
