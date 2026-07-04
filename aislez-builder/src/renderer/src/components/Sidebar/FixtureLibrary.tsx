import React from 'react'
import { FIXTURE_COLORS } from '../Canvas/FixtureLayer'
import { FIXTURE_DEFAULTS_BY_UNIT } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import type { FixtureType } from '../../types'

interface FixtureDef {
  type: FixtureType
  label: string
}

const FIXTURE_TYPES: FixtureDef[] = [
  { type: 'shelf',    label: 'Shelf' },
  { type: 'chiller',  label: 'Chiller' },
  { type: 'bunker',   label: 'Bunker' },
  { type: 'endcap',   label: 'End Cap' },
  { type: 'sidekick', label: 'Side Kick' },
  { type: 'pallet',   label: 'Pallet' },
  { type: 'rack',     label: 'Rack' },
  { type: 'table',    label: 'Table' },
  { type: 'bin',      label: 'Bin' }
]

interface FixtureItemProps {
  type: FixtureType
  label: string
}

function FixtureItem({ type, label }: FixtureItemProps): React.ReactElement {
  const { settings, pixelsPerUnit, formatUnitShort } = useProjectStore()
  const unit = settings?.unit ?? 'meters'
  const color = FIXTURE_COLORS[type]
  const defaults = FIXTURE_DEFAULTS_BY_UNIT[unit][type]

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData('fixtureType', type)
    e.dataTransfer.effectAllowed = 'copy'

    // Drag preview: canvas drawn at the fixture's actual pixel dimensions
    const pw = Math.round(defaults.width * pixelsPerUnit)
    const ph = Math.round(defaults.height * pixelsPerUnit)

    const canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'
    document.body.appendChild(canvas)

    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(0, 0, pw, ph, 4)
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    const fontSize = Math.max(9, Math.min(13, ph * 0.35))
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pw / 2, ph / 2)

    // Cursor anchored to centre so the fixture lands exactly where dropped
    e.dataTransfer.setDragImage(canvas, pw / 2, ph / 2)
    setTimeout(() => canvas.remove(), 0)
  }

  const dimLabel = `${formatUnitShort(defaults.width)} × ${formatUnitShort(defaults.height)}`

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        borderRadius: 6,
        cursor: 'grab',
        background: 'rgba(255,255,255,0.06)',
        marginBottom: 4,
        transition: 'background 0.15s'
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.12)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)')}
    >
      <div
        style={{
          width: 24,
          height: 12,
          borderRadius: 3,
          background: color,
          flexShrink: 0
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, color: '#dde0e8' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#555570' }}>{dimLabel}</span>
      </div>
    </div>
  )
}

export default function FixtureLibrary(): React.ReactElement {
  return (
    <div style={{ padding: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#7a7a9a',
          marginBottom: 10
        }}
      >
        Fixtures
      </div>
      {FIXTURE_TYPES.map(({ type, label }) => (
        <FixtureItem key={type} type={type} label={label} />
      ))}
      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: '#555570',
          textAlign: 'center',
          lineHeight: 1.5
        }}
      >
        Drag onto canvas to place
      </div>
    </div>
  )
}
