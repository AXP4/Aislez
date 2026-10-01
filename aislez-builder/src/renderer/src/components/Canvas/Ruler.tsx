import React, { useRef, useEffect } from 'react'
import type { Unit } from '../../types'

export const RULER_SIZE = 24

// Nice tick intervals in real-world units, from finest to coarsest
const NICE_INTERVALS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]
const MIN_TICK_PX    = 5    // minimum screen pixels between ticks
const MIN_LABEL_GAP  = 44   // minimum screen pixels between labels

function niceInterval(minUnits: number): number {
  return NICE_INTERVALS.find((i) => i >= minUnits) ?? 500
}

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  length: number
  pixelsPerUnit: number
  unit: Unit
  zoom: number
  panOffset: number  // panX for horizontal, panY for vertical
}

function draw(
  canvas: HTMLCanvasElement,
  orientation: 'horizontal' | 'vertical',
  length: number,
  pixelsPerUnit: number,
  unit: Unit,
  zoom: number,
  panOffset: number
): void {
  const isH = orientation === 'horizontal'
  canvas.width  = isH ? length : RULER_SIZE
  canvas.height = isH ? RULER_SIZE : length

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Separator
  ctx.strokeStyle = '#2a2a44'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (isH) { ctx.moveTo(0, RULER_SIZE - 0.5); ctx.lineTo(length, RULER_SIZE - 0.5) }
  else      { ctx.moveTo(RULER_SIZE - 0.5, 0); ctx.lineTo(RULER_SIZE - 0.5, length) }
  ctx.stroke()

  // Effective pixels per unit on screen
  const eppu = pixelsPerUnit * zoom
  if (eppu < 0.5) return  // too small to render meaningfully

  // Dynamic tick interval so ticks are always >= MIN_TICK_PX apart on screen
  const minorInterval   = niceInterval(MIN_TICK_PX  / eppu)
  const majorInterval   = niceInterval(minorInterval * 2)
  const labelInterval   = niceInterval(MIN_LABEL_GAP / eppu)
  const minorTickScreen = minorInterval * eppu

  const majorRatio = Math.round(majorInterval / minorInterval)
  const labelRatio = Math.round(labelInterval / minorInterval)

  ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

  // First tick index visible on screen
  const firstIdx = Math.floor(-panOffset / minorTickScreen)

  for (let i = 0; ; i++) {
    const idx = firstIdx + i
    const px  = panOffset + idx * minorTickScreen

    if (px > length + minorTickScreen) break

    const isMajor   = idx % majorRatio === 0
    const unitVal   = idx * minorInterval

    if (unitVal < -0.0001) continue  // skip negative canvas positions
    if (px < -0.5) continue

    const tickLen = isMajor ? 10 : 5
    ctx.strokeStyle = isMajor ? '#3a3a56' : '#27273e'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    if (isH) {
      ctx.moveTo(px + 0.5, RULER_SIZE - 1)
      ctx.lineTo(px + 0.5, RULER_SIZE - 1 - tickLen)
    } else {
      ctx.moveTo(RULER_SIZE - 1, px + 0.5)
      ctx.lineTo(RULER_SIZE - 1 - tickLen, px + 0.5)
    }
    ctx.stroke()

    const showLabel = isMajor && idx % labelRatio === 0
    if (showLabel) {
      ctx.fillStyle = '#5a5a7a'
      const label = String(Math.round(unitVal * 1000) / 1000)
      if (isH) {
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, px, 2)
      } else {
        ctx.textAlign    = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, RULER_SIZE - tickLen - 3, px)
      }
    }
  }
}

export default function Ruler({
  orientation, length, pixelsPerUnit, unit, zoom, panOffset
}: RulerProps): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) draw(ref.current, orientation, length, pixelsPerUnit, unit, zoom, panOffset)
  }, [orientation, length, pixelsPerUnit, unit, zoom, panOffset])

  const isH = orientation === 'horizontal'
  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        top:    isH ? 0 : RULER_SIZE,
        left:   isH ? RULER_SIZE : 0,
        width:  isH ? length : RULER_SIZE,
        height: isH ? RULER_SIZE : length,
        display: 'block',
        imageRendering: 'pixelated'
      }}
    />
  )
}
