import React from 'react'
import { Layer, Shape } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import type { Direction } from '../../utils/chain'
import type { Fixture } from '../../types'

export interface ArrowSpec {
  fixtureId: string
  direction: Direction
  cx: number
  cy: number
  rotation: number
}

export const ARROW_GAP_PX    = 7
export const ARROW_RADIUS_PX = 5
export const ARROW_HIT_PAD   = 10
export const ARROW_COLOR     = '#27ae60'
export const ARROW_OPACITY   = 0.9

export function makeArrow(
  fixtureId: string,
  dir: Direction,
  px: number, py: number,
  pw: number, ph: number,
  cx: number, cy: number
): ArrowSpec {
  const rotation = dir === 'up' ? 0 : dir === 'right' ? 90 : dir === 'down' ? 180 : 270
  let acx: number, acy: number
  switch (dir) {
    case 'right': acx = px + pw + ARROW_GAP_PX + ARROW_RADIUS_PX; acy = cy; break
    case 'left':  acx = px - ARROW_GAP_PX - ARROW_RADIUS_PX;      acy = cy; break
    case 'down':  acx = cx; acy = py + ph + ARROW_GAP_PX + ARROW_RADIUS_PX; break
    case 'up':    acx = cx; acy = py - ARROW_GAP_PX - ARROW_RADIUS_PX;      break
    default:      acx = cx; acy = cy
  }
  return { fixtureId, direction: dir, cx: acx, cy: acy, rotation }
}

/** Only draws arrows for standalone (unchained) fixtures. Chained tails are handled by ChainGroup. */
export function buildStandaloneArrows(fixture: Fixture, ppu: number): ArrowSpec[] {
  if (fixture.prevId || fixture.nextId) return []  // chained — handled elsewhere
  const px = fixture.x * ppu
  const py = fixture.y * ppu
  const pw = fixture.width  * ppu
  const ph = fixture.height * ppu
  const cx = px + pw / 2
  const cy = py + ph / 2
  return (['up', 'down', 'left', 'right'] as Direction[]).map(dir =>
    makeArrow(fixture.id, dir, px, py, pw, ph, cx, cy)
  )
}

export function renderArrowShape(
  spec: ArrowSpec,
  onExtend: (fixtureId: string, dir: Direction) => void
): React.ReactElement {
  const rad = ARROW_RADIUS_PX
  const toRad = (deg: number): number => (deg * Math.PI) / 180

  return (
    <Shape
      key={`${spec.fixtureId}-${spec.direction}`}
      x={spec.cx}
      y={spec.cy}
      rotation={spec.rotation}
      listening={true}
      sceneFunc={(ctx) => {
        ctx.beginPath()
        ctx.moveTo(0, -rad)
        ctx.lineTo( rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
        ctx.lineTo(-rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
        ctx.closePath()
        ;(ctx as unknown as CanvasRenderingContext2D).fillStyle = ARROW_COLOR
        ctx.fill()
      }}
      hitFunc={(ctx, shape) => {
        const p = rad + ARROW_HIT_PAD
        ctx.beginPath()
        ctx.rect(-p, -p, p * 2, p * 2)
        ctx.fillStrokeShape(shape)
      }}
      opacity={ARROW_OPACITY}
      onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        onExtend(spec.fixtureId, spec.direction)
      }}
      onTap={(e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        onExtend(spec.fixtureId, spec.direction)
      }}
    />
  )
}

/** Arrows are now rendered inline inside FixtureShape/ChainGroup so they move with fixtures during drag. */
export default function ArrowLayer(): React.ReactElement {
  return <Layer listening={false} />
}
