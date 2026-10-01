import React, { useState, useCallback, useEffect } from 'react'
import { Layer, Rect, Line, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore, type ToolPoint } from '../../store/uiStore'

const HUGE = 100000  // covers the visible viewport at any pan/zoom for hit-testing
const CALIBRATE_COLOR = '#F5A623'

// ─── Calibrate tool ─────────────────────────────────────────────────────────
//
// For a retailer who only has a photo/blueprint (not a known total footprint
// size): click two points at a distance you can read off the image (a
// labeled wall, a column grid spacing, anything), type that real-world
// distance in the overlay input below, and the whole background photo is
// rescaled and snapped back to (0,0) so those two points end up exactly that
// far apart. Repositioning to the origin (rather than anchoring on whichever
// point was clicked first) gives a clean, predictable baseline to trace the
// outline from next, the same way the Draw tool's own finalize() shifts a
// finished sketch so its bounding box starts at (0,0). This is the
// alternative to the normal flow of drawing the outline first and fitting
// the photo to it: scale the photo first, then trace the real outline on
// top of it with the Draw tool.

/** Applies a two-point calibration: rescales the background image so `a`→`b` measures `realDistance` world units, and resets its position to (0,0). */
function applyCalibration(a: ToolPoint, b: ToolPoint, realDistance: number): void {
  const { settings, updateBackgroundImage } = useProjectStore.getState()
  const bg = settings?.backgroundImage
  if (!bg || realDistance <= 0) return
  const currentDist = Math.hypot(b.x - a.x, b.y - a.y)
  if (currentDist <= 0) return
  const scale = realDistance / currentDist
  const newWidth  = Math.round(bg.width  * scale * 100) / 100
  const newHeight = Math.round(bg.height * scale * 100) / 100
  updateBackgroundImage({ x: 0, y: 0, width: newWidth, height: newHeight })
  useUiStore.getState().setActiveTool('select')  // also clears toolPoints
}

/** Konva layer: click two points on the background photo to mark a known real-world distance between them. */
export default function CalibrateLayer(): React.ReactElement {
  const { pixelsPerUnit: ppu, settings } = useProjectStore()
  const { zoom, panX, panY, toolPoints: points, pushToolPoint } = useUiStore()

  const [cursor, setCursor] = useState<ToolPoint | null>(null)

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage()
    const pos = stage?.getRelativePointerPosition()
    if (!pos) return
    setCursor({ x: pos.x / ppu, y: pos.y / ppu })
  }, [ppu])

  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    e.cancelBubble = true
    if (e.evt.button !== 0 || points.length >= 2 || !cursor) return
    pushToolPoint(cursor)
  }, [points.length, cursor, pushToolPoint])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return  // the distance input handles its own Escape/Enter
      if (e.key === 'Escape') { useUiStore.getState().setActiveTool('select'); return }
      if (e.key === 'Backspace') { useUiStore.getState().popToolPoint(); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!settings?.backgroundImage) return <Layer />

  const a = points[0] ?? null
  const b = points[1] ?? null
  const flat = (pts: ToolPoint[]): number[] => pts.flatMap((p) => [p.x * ppu, p.y * ppu])

  return (
    <Layer>
      <Rect
        x={-HUGE / 2} y={-HUGE / 2} width={HUGE} height={HUGE}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onTap={handleClick}
      />

      {a && (b || cursor) && (
        <Line
          points={flat(b ? [a, b] : [a, cursor!])}
          stroke={CALIBRATE_COLOR}
          strokeWidth={2 / zoom}
          dash={b ? undefined : [6 / zoom, 4 / zoom]}
          listening={false}
        />
      )}

      {points.map((p, i) => (
        <Circle key={i} x={p.x * ppu} y={p.y * ppu} radius={5 / zoom} fill={CALIBRATE_COLOR} stroke="#ffffff" strokeWidth={1.5 / zoom} listening={false} />
      ))}

      <Text
        x={(20 - panX) / zoom} y={(20 - panY) / zoom}
        text={
          points.length === 0 ? 'Click one end of a distance you know from the photo'
            : points.length === 1 ? 'Click the other end of that distance'
              : 'Type the real-world distance below, then press Enter'
        }
        fontSize={14 / zoom}
        fill="#7a7a9a"
        listening={false}
      />
    </Layer>
  )
}

/** Plain HTML overlay (needs a real <input>, so it can't live inside the Konva Layer) shown once both points are placed. Rendered by StoreCanvas alongside its other overlays. */
export function CalibrateInput(): React.ReactElement | null {
  const points = useUiStore((s) => s.toolPoints)
  const unit = useProjectStore((s) => s.settings?.unit)
  const [value, setValue] = useState('')

  useEffect(() => { setValue('') }, [points.length])

  if (points.length < 2) return null
  const [a, b] = points as [ToolPoint, ToolPoint]
  const unitLabel = unit === 'feet' ? 'ft' : 'm'

  const submit = (): void => {
    const n = parseFloat(value)
    if (!isNaN(n) && n > 0) applyCalibration(a, b, n)
  }

  return (
    <div style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a2e', color: '#dde0e8', border: '1px solid #3a3a5a',
      borderRadius: 6, padding: '7px 10px', fontSize: 12, lineHeight: 1.5,
      display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', zIndex: 20
    }}>
      <span>Real-world distance between the two points:</span>
      <input
        autoFocus
        type="number" min="0" step="any" value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') useUiStore.getState().setActiveTool('select')
        }}
        style={{ width: 70, background: '#0f0f1e', border: '1px solid #3a3a5a', borderRadius: 4, color: '#dde0e8', padding: '3px 6px', fontSize: 12 }}
      />
      <span>{unitLabel}</span>
      <button
        onClick={submit}
        style={{ background: '#4A90D9', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
      >
        Apply
      </button>
      <button
        onClick={() => useUiStore.getState().setActiveTool('select')}
        style={{ background: 'transparent', border: '1px solid #3a3a5a', borderRadius: 4, color: '#a0a0b8', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
      >
        Cancel
      </button>
    </div>
  )
}
