import { useEffect, useRef, useState } from 'react'
import type { DataPackage } from '../types'
import { edgeOutwardNormal, offsetRectilinearPolygonOutward, pointAt } from '../utils/geometry'

interface Props {
  data: DataPackage
  highlightedFixtureId: string | null
}

const HIGHLIGHT_COLOR = '#e74c3c'
const FLOOR_COLOR = '#fafafa'
const ENTRANCE_COLOR = '#e63946'
const PAD_PX = 28
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.15

interface View { zoom: number; panX: number; panY: number }
const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }

/**
 * Plain Canvas 2D rendering — read-only, no dragging of store contents, so
 * none of Builder's Konva machinery is needed. Fixture/wall `rotation` is
 * always 0 in practice (Builder's own rotate actions swap width/height
 * instead of applying a real transform), so this never needs to handle
 * rotated rects.
 *
 * The map has its own independent scroll-to-zoom + drag-to-pan (mirroring
 * Builder's canvas), deliberately separate from the browser's own page zoom —
 * a website can't scope browser zoom to one element, but a dedicated map
 * zoom is standard practice (Google Maps etc.) and keeps the header/search
 * UI a fixed, predictable size while the shopper zooms into the floor plan.
 */
export default function StoreMap({ data, highlightedFixtureId }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 600, height: 400 })
  const [blinkOn, setBlinkOn] = useState(true)
  const [view, setView] = useState<View>(DEFAULT_VIEW)
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pinchRef = useRef<{ startDist: number; startZoom: number; startPanX: number; startPanY: number; midX: number; midY: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Non-passive wheel listener so preventDefault actually stops page scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView((v) => {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
        return {
          zoom: newZoom,
          panX: mx - (mx - v.panX) * (newZoom / v.zoom),
          panY: my - (my - v.panY) * (newZoom / v.zoom)
        }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent): void => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: view.panX, startPanY: view.panY }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      setView((v) => ({ ...v, panX: d.startPanX + (e.clientX - d.startX), panY: d.startPanY + (e.clientY - d.startY) }))
    }
    const onUp = (): void => { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Touch equivalent of the mouse drag/wheel handlers above — a real phone/tablet has no mouse
  // events at all, so without this the map couldn't be panned or zoomed on a touchscreen. One
  // finger pans (same math as handleMouseDown/onMove); two fingers pinch-zoom, tracked the same
  // way the wheel handler zooms around the cursor, just around the pinch midpoint instead. Ending
  // a gesture always requires lifting back to 0 fingers — going from two touches to one doesn't
  // try to seamlessly hand off into a pan, it just waits for the next clean touchstart.
  const handleTouchStart = (e: React.TouchEvent): void => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      pinchRef.current = null
      dragRef.current = { startX: t.clientX, startY: t.clientY, startPanX: view.panX, startPanY: view.panY }
    } else if (e.touches.length === 2) {
      dragRef.current = null
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const [a, b] = [e.touches[0], e.touches[1]]
      pinchRef.current = {
        startDist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        startZoom: view.zoom, startPanX: view.panX, startPanY: view.panY,
        midX: (a.clientX + b.clientX) / 2 - rect.left, midY: (a.clientY + b.clientY) / 2 - rect.top
      }
    }
  }
  useEffect(() => {
    const onTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 1 && dragRef.current) {
        e.preventDefault()
        const t = e.touches[0]
        const d = dragRef.current
        setView((v) => ({ ...v, panX: d.startPanX + (t.clientX - d.startX), panY: d.startPanY + (t.clientY - d.startY) }))
      } else if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const p = pinchRef.current
        const [a, b] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.startZoom * (dist / p.startDist)))
        setView({
          zoom: newZoom,
          panX: p.midX - (p.midX - p.startPanX) * (newZoom / p.startZoom),
          panY: p.midY - (p.midY - p.startPanY) * (newZoom / p.startZoom)
        })
      }
    }
    const onTouchEnd = (e: TouchEvent): void => {
      if (e.touches.length !== 1) dragRef.current = null
      if (e.touches.length !== 2) pinchRef.current = null
    }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  // Blink the highlighted fixture a few times, then settle into a steady highlight
  useEffect(() => {
    if (!highlightedFixtureId) return
    setBlinkOn(true)
    let count = 0
    const id = window.setInterval(() => {
      count++
      setBlinkOn((v) => !v)
      if (count >= 6) { window.clearInterval(id); setBlinkOn(true) }
    }, 220)
    return () => window.clearInterval(id)
  }, [highlightedFixtureId])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    const { storeOutline, perimeterThickness, wallColor } = data.store
    if (storeOutline.length < 3) return

    const xs = storeOutline.map((p) => p.x)
    const ys = storeOutline.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const spanX = Math.max(maxX - minX, 0.01)
    const spanY = Math.max(maxY - minY, 0.01)
    const fitScale = Math.min((size.width - PAD_PX * 2) / spanX, (size.height - PAD_PX * 2) / spanY)
    const fitOffsetX = (size.width - spanX * fitScale) / 2 - minX * fitScale
    const fitOffsetY = (size.height - spanY * fitScale) / 2 - minY * fitScale
    // Fit-to-container first, then the map's own independent zoom/pan on top
    const scale = fitScale * view.zoom
    const tx = (x: number): number => (x * fitScale + fitOffsetX) * view.zoom + view.panX
    const ty = (y: number): number => (y * fitScale + fitOffsetY) * view.zoom + view.panY

    // Floor
    ctx.fillStyle = FLOOR_COLOR
    ctx.beginPath()
    storeOutline.forEach((p, i) => (i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y))))
    ctx.closePath()
    ctx.fill()

    // Perimeter: a filled ring between storeOutline and its per-edge outward offset, traced as
    // ONE continuous path (outer forward, inner reversed — opposite winding makes the inner
    // polygon a hole under the canvas's nonzero fill rule). Filling one shape gives clean,
    // automatically-mitered corners for free; the previous approach stroked each edge as its own
    // independent line, which left a visible seam/gap at every corner — barely noticeable on a
    // simple rectangle, but an irregular hand-traced outline with many corners close together
    // (e.g. a real blueprint's loading-dock jogs) turned into an obviously patchy wall.
    const n = storeOutline.length
    const outer = offsetRectilinearPolygonOutward(storeOutline, perimeterThickness)
    ctx.fillStyle = wallColor
    ctx.beginPath()
    outer.forEach((p, i) => (i === 0 ? ctx.moveTo(tx(p.x), ty(p.y)) : ctx.lineTo(tx(p.x), ty(p.y))))
    ctx.closePath()
    for (let i = n - 1; i >= 0; i--) {
      const p = storeOutline[i]
      if (i === n - 1) ctx.moveTo(tx(p.x), ty(p.y))
      else ctx.lineTo(tx(p.x), ty(p.y))
    }
    ctx.closePath()
    ctx.fill()

    // Entrances: punch a red-colored opening through the band, spanning the local perimeter
    // thickness at that edge — a filled quad (same idea as Builder's EntranceLayer), not a thin line.
    // Floor-colored used to blend into the near-white floor fill, making entrances invisible.
    for (const ent of data.entrances) {
      const i = ent.edgeIndex
      if (i < 0 || i >= n) continue
      const p1 = storeOutline[i]
      const p2 = storeOutline[(i + 1) % n]
      const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (edgeLen === 0) continue
      const normal = edgeOutwardNormal(storeOutline, i)
      const thickness = perimeterThickness[i] ?? 0
      const a = pointAt(p1, p2, edgeLen, ent.offset)
      const b = pointAt(p1, p2, edgeLen, ent.offset + ent.width)
      ctx.fillStyle = ENTRANCE_COLOR
      ctx.beginPath()
      ctx.moveTo(tx(a.x), ty(a.y))
      ctx.lineTo(tx(b.x), ty(b.y))
      ctx.lineTo(tx(b.x + normal.x * thickness), ty(b.y + normal.y * thickness))
      ctx.lineTo(tx(a.x + normal.x * thickness), ty(a.y + normal.y * thickness))
      ctx.closePath()
      ctx.fill()
    }

    // Interior walls
    ctx.fillStyle = wallColor
    for (const w of data.walls) {
      ctx.fillRect(tx(w.x), ty(w.y), w.width * scale, w.height * scale)
    }

    // Fixtures
    let highlighted: { x: number; y: number; w: number; h: number } | null = null
    for (const f of data.fixtures) {
      const isHighlighted = f.id === highlightedFixtureId
      const x = tx(f.x), y = ty(f.y), w = f.width * scale, h = f.height * scale

      ctx.fillStyle = f.color
      ctx.fillRect(x, y, w, h)

      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, w, h)

      const label = f.locationCode || f.abbrev
      if (label && w > 18 && h > 10) {
        ctx.fillStyle = '#fff'
        ctx.font = `${Math.min(11, h * 0.55)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, x + w / 2, y + h / 2)
      }

      if (isHighlighted) highlighted = { x, y, w, h }
    }

    // Highlight border drawn last, on top of every fixture — a centered stroke straddles
    // into the neighboring fixture, and if drawn during the main loop the next fixture's own
    // fill paints right over that half, making the shared edge look thinner than the other three.
    if (highlighted && blinkOn) {
      ctx.strokeStyle = HIGHLIGHT_COLOR
      ctx.lineWidth = 3
      ctx.strokeRect(highlighted.x, highlighted.y, highlighted.w, highlighted.h)
    }
  }, [data, size, highlightedFixtureId, blinkOn, view])

  const isDefaultView = view.zoom === 1 && view.panX === 0 && view.panY === 0

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', cursor: 'grab', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={() => setView(DEFAULT_VIEW)}
    >
      <canvas ref={canvasRef} />
      {!isDefaultView && (
        <button
          onClick={() => setView(DEFAULT_VIEW)}
          style={{
            position: 'absolute', top: 12, right: 12,
            padding: '6px 12px', borderRadius: 8, border: '1px solid #d4d7de',
            background: '#fff', fontSize: 12, fontWeight: 600, color: '#1a1a2e',
            cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
          }}
        >
          Reset view
        </button>
      )}
    </div>
  )
}
