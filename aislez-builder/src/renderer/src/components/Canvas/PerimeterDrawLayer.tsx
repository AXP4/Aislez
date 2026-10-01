import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Layer, Rect, Line, Circle, Text } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore, makePerimeterThickness } from '../../store/projectStore'
import { useUiStore, type ToolPoint as Point } from '../../store/uiStore'
import { updateGuides, GUIDE_THRESHOLD_PX } from './FixtureLayer'
import { wouldSegmentSelfIntersect } from '../../utils/geometry'
import { WALL_COLOR } from '../../types'

const CLOSE_THRESHOLD_PX = 14
const HUGE = 100000  // covers the visible viewport at any pan/zoom for hit-testing

/**
 * Fusion-360-style perimeter sketch tool: click to place corners, each new
 * segment snapped to horizontal/vertical relative to the last point, type a
 * number for an exact length, click back near the start to close the loop.
 */
export default function PerimeterDrawLayer(): React.ReactElement {
  const { pixelsPerUnit: ppu, gridSizePx, settings } = useProjectStore()
  const { zoom, gridMode, panX, panY, toolPoints: points, pushToolPoint, popToolPoint } = useUiStore()

  const [cursor, setCursor] = useState<Point | null>(null)
  const [numberBuffer, setNumberBuffer] = useState('')

  const unitLabel = settings?.unit === 'feet' ? 'ft' : 'm'
  const last  = points.length ? points[points.length - 1] : null
  const start = points.length ? points[0] : null

  // Perpendicular-snapped candidate for the next point (before close-detection).
  // In grid-off mode, the free axis also snaps to any already-placed corner —
  // this is what makes it possible to land exactly back on an earlier point.
  let rawPreview: Point | null = null
  let guideXWorld: number | null = null
  let guideYWorld: number | null = null

  if (cursor) {
    if (!last) {
      if (gridMode === 'off') rawPreview = cursor
      else {
        const sw = gridSizePx / ppu
        rawPreview = { x: Math.round(cursor.x / sw) * sw, y: Math.round(cursor.y / sw) * sw }
      }
    } else {
      const dx = cursor.x - last.x
      const dy = cursor.y - last.y
      const horizontal = Math.abs(dx) >= Math.abs(dy)
      const dir = (horizontal ? Math.sign(dx) : Math.sign(dy)) || 1
      const typed = parseFloat(numberBuffer)

      let freeCoord = horizontal ? cursor.x : cursor.y
      if (numberBuffer && !isNaN(typed) && typed > 0) {
        freeCoord = (horizontal ? last.x : last.y) + dir * typed
      } else if (gridMode === 'off') {
        const threshold = GUIDE_THRESHOLD_PX / (zoom * ppu)
        let best: number | null = null
        let bestDist = threshold
        for (const p of points) {
          const candidate = horizontal ? p.x : p.y
          const dist = Math.abs(candidate - freeCoord)
          if (dist < bestDist) { bestDist = dist; best = candidate }
        }
        if (best !== null) {
          freeCoord = best
          if (horizontal) guideXWorld = best; else guideYWorld = best
        }
      } else {
        const sw = gridSizePx / ppu
        freeCoord = Math.round(freeCoord / sw) * sw
      }

      rawPreview = horizontal ? { x: freeCoord, y: last.y } : { x: last.x, y: freeCoord }
    }
  }

  // Snapping back onto the start point closes the loop
  let isClosing = false
  let preview = rawPreview
  if (rawPreview && start && last && points.length >= 3) {
    const distPx = Math.hypot(rawPreview.x - start.x, rawPreview.y - start.y) * ppu * zoom
    if (distPx < CLOSE_THRESHOLD_PX) {
      isClosing = true
      preview = { x: start.x, y: start.y }
      guideXWorld = start.x
      guideYWorld = start.y
    }
  }

  const segLen = last && preview ? Math.hypot(preview.x - last.x, preview.y - last.y) : 0

  // Reject a segment that would retrace or cross the outline drawn so far —
  // either makes the loop non-simple (a figure-eight / an accidentally-split
  // second space) instead of one clean boundary.
  const blocked = !!(last && preview && wouldSegmentSelfIntersect(points, last, preview, isClosing))

  useEffect(() => {
    updateGuides(guideYWorld, guideXWorld)
  }, [guideYWorld, guideXWorld])

  useEffect(() => () => updateGuides(null, null), [])

  const finalize = useCallback((): void => {
    const pts = useUiStore.getState().toolPoints
    if (pts.length < 3) return
    const minX = Math.min(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y))
    const maxX = Math.max(...pts.map((p) => p.x))
    const maxY = Math.max(...pts.map((p) => p.y))
    const shifted = pts.map((p) => ({
      x: Math.round((p.x - minX) * 100) / 100,
      y: Math.round((p.y - minY) * 100) / 100
    }))
    const unit = useProjectStore.getState().settings!.unit
    useProjectStore.getState().updateSettings({
      storeWidth:   Math.round((maxX - minX) * 100) / 100,
      storeHeight:  Math.round((maxY - minY) * 100) / 100,
      storeOutline: shifted,
      perimeterThickness: makePerimeterThickness(unit, shifted.length),
      outlineDrawn: true
    })
    useUiStore.getState().setActiveTool('select')  // also clears toolPoints
  }, [])

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    const stage = e.target.getStage()
    const pos = stage?.getRelativePointerPosition()
    if (!pos) return
    setCursor({ x: pos.x / ppu, y: pos.y / ppu })
  }, [ppu])

  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>): void => {
    e.cancelBubble = true
    if (e.evt.button !== 0 || !preview || blocked) return
    if (isClosing) { finalize(); return }
    pushToolPoint(preview!)
    setNumberBuffer('')
  }, [preview, isClosing, finalize, blocked, pushToolPoint])

  // Keyboard: digits build an exact length, Enter commits it, Backspace undoes
  // a digit or the last corner, Escape cancels the number or the whole sketch.
  const liveRef = useRef({ numberBuffer, preview, isClosing, last, blocked })
  liveRef.current = { numberBuffer, preview, isClosing, last, blocked }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const { numberBuffer: buf, preview: pv, isClosing: closing, last: lastPt, blocked: isBlocked } = liveRef.current

      if (e.key === 'Escape') {
        if (buf) { setNumberBuffer(''); return }
        setCursor(null)
        useUiStore.getState().setActiveTool('select')  // also clears toolPoints
        return
      }
      if (e.key === 'Backspace') {
        if (buf) { setNumberBuffer((b) => b.slice(0, -1)); return }
        popToolPoint()
        return
      }
      if (e.key === 'Enter') {
        if (buf && pv && lastPt && !isBlocked) {
          if (closing) finalize()
          else pushToolPoint(pv)
          setNumberBuffer('')
        }
        return
      }
      if (/^[0-9.]$/.test(e.key) && lastPt) {
        setNumberBuffer((b) => (e.key === '.' && b.includes('.')) ? b : b + e.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finalize])

  const flat = (pts: Point[]): number[] => pts.flatMap((p) => [p.x * ppu, p.y * ppu])

  return (
    <Layer>
      <Rect
        x={-HUGE / 2} y={-HUGE / 2} width={HUGE} height={HUGE}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onTap={handleClick}
      />

      {points.length > 0 && (
        <Line points={flat(points)} stroke={WALL_COLOR} strokeWidth={2 / zoom} lineJoin="round" listening={false} />
      )}

      {last && preview && (
        <Line
          points={flat([last, preview])}
          stroke={blocked ? '#E74C3C' : isClosing ? '#27AE60' : WALL_COLOR}
          strokeWidth={2 / zoom}
          dash={[6 / zoom, 4 / zoom]}
          listening={false}
        />
      )}

      {points.map((p, i) => (
        <Circle key={i} x={p.x * ppu} y={p.y * ppu} radius={4 / zoom} fill={WALL_COLOR} listening={false} />
      ))}

      {start && (
        <Circle
          x={start.x * ppu} y={start.y * ppu}
          radius={(isClosing ? 8 : 4) / zoom}
          fill={isClosing ? '#27AE60' : WALL_COLOR}
          stroke={isClosing ? '#ffffff' : undefined}
          strokeWidth={isClosing ? 1.5 / zoom : 0}
          listening={false}
        />
      )}

      {last && preview && (
        <Text
          x={((last.x + preview.x) / 2) * ppu}
          y={((last.y + preview.y) / 2) * ppu - 18 / zoom}
          text={blocked ? "Can't cross or retrace the outline" : isClosing ? 'Click to close' : numberBuffer ? `${numberBuffer} ${unitLabel}` : `${segLen.toFixed(2)} ${unitLabel}`}
          fontSize={13 / zoom}
          fontStyle="bold"
          fill={blocked ? '#E74C3C' : isClosing ? '#27AE60' : '#2c3e50'}
          listening={false}
        />
      )}

      {points.length === 0 && (
        <Text
          x={(20 - panX) / zoom} y={(20 - panY) / zoom}
          text="Click to place the first corner of your store outline"
          fontSize={14 / zoom}
          fill="#7a7a9a"
          listening={false}
        />
      )}
    </Layer>
  )
}
