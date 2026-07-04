import React from 'react'
import { Layer, Shape } from 'react-konva'
import type { GridMode } from '../../store/uiStore'

interface GridLayerProps {
  width: number
  height: number
  gridSizePx: number
  mode: Exclude<GridMode, 'off'>
  /** Layer offset in content space so the grid covers the visible viewport */
  offsetX?: number
  offsetY?: number
}

const DOT_RADIUS = 1.2
const DOT_COLOR  = '#c2c6d4'
const LINE_COLOR = '#dde0e8'

export default function GridLayer({
  width, height, gridSizePx, mode, offsetX = 0, offsetY = 0
}: GridLayerProps): React.ReactElement {
  return (
    <Layer listening={false} x={offsetX} y={offsetY}>
      <Shape
        width={width}
        height={height}
        listening={false}
        sceneFunc={(ctx) => {
          const c = ctx as any // eslint-disable-line @typescript-eslint/no-explicit-any
          ctx.beginPath()

          if (mode === 'dots') {
            c.fillStyle = DOT_COLOR
            for (let x = 0; x <= width; x += gridSizePx) {
              for (let y = 0; y <= height; y += gridSizePx) {
                ctx.moveTo(x + DOT_RADIUS, y)
                ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2)
              }
            }
            ctx.fill()
          } else {
            c.strokeStyle = LINE_COLOR
            c.lineWidth = 0.5
            for (let x = 0; x <= width; x += gridSizePx) {
              ctx.moveTo(x, 0)
              ctx.lineTo(x, height)
            }
            for (let y = 0; y <= height; y += gridSizePx) {
              ctx.moveTo(0, y)
              ctx.lineTo(width, y)
            }
            ctx.stroke()
          }
        }}
      />
    </Layer>
  )
}
