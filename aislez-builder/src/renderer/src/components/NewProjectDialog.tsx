import React, { useState } from 'react'
import { useProjectStore, DEFAULT_DIMENSIONS, DEFAULT_GRID_SNAP, MIN_GRID_SNAP, MAX_GRID_SNAP, makePerimeterThickness } from '../store/projectStore'
import type { Unit, ProjectSettings } from '../types'

type StoreShape = 'rectangle' | 'custom'

const LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#9090a8',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 6
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#12121f',
  border: '1px solid #3a3a5a',
  borderRadius: 6,
  color: '#e0e0f0',
  fontSize: 14,
  outline: 'none'
}

const ROW: React.CSSProperties = { display: 'flex', gap: 12 }

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={LABEL}>{label}</div>
      {children}
    </div>
  )
}

interface Props { onBack: () => void }

export default function NewProjectDialog({ onBack }: Props): React.ReactElement {
  const { initProject } = useProjectStore()

  const [name, setName]         = useState('My Store')
  const [unit, setUnit]         = useState<Unit>('meters')
  const [shape, setShape]       = useState<StoreShape>('rectangle')
  const [width, setWidth]       = useState(DEFAULT_DIMENSIONS.meters.width)
  const [height, setHeight]     = useState(DEFAULT_DIMENSIONS.meters.height)
  const [gridSnap, setGridSnap] = useState(DEFAULT_GRID_SNAP)
  const [error, setError]       = useState('')

  const unitLabel = unit === 'meters' ? 'm' : 'ft'

  const handleUnitChange = (next: Unit): void => {
    if (next === unit) return
    const factor = next === 'feet' ? 3.28084 : 1 / 3.28084
    setWidth(parseFloat((width * factor).toFixed(1)))
    setHeight(parseFloat((height * factor).toFixed(1)))
    setUnit(next)
  }

  const handleSubmit = (): void => {
    if (!name.trim()) { setError('Store name is required.'); return }
    if (shape === 'rectangle' && (width <= 0 || height <= 0)) {
      setError('Width and height must be greater than 0.'); return
    }
    if (gridSnap < MIN_GRID_SNAP || gridSnap > MAX_GRID_SNAP) {
      setError(`Snap must be between ${MIN_GRID_SNAP} and ${MAX_GRID_SNAP} ${unitLabel}.`); return
    }

    if (shape === 'rectangle') {
      const outline = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
      const settings: ProjectSettings = {
        name: name.trim(), unit, storeWidth: width, storeHeight: height, gridSnap,
        storeOutline: outline, perimeterThickness: makePerimeterThickness(unit, outline.length),
        backgroundImage: null, outlineDrawn: true
      }
      initProject(settings)
    } else {
      const dims = DEFAULT_DIMENSIONS[unit]
      const outline = [{ x: 0, y: 0 }, { x: dims.width, y: 0 }, { x: dims.width, y: dims.height }, { x: 0, y: dims.height }]
      const settings: ProjectSettings = {
        name: name.trim(), unit, storeWidth: dims.width, storeHeight: dims.height, gridSnap,
        storeOutline: outline, perimeterThickness: makePerimeterThickness(unit, outline.length),
        backgroundImage: null, outlineDrawn: false
      }
      initProject(settings)
      // Lands in 'select', not 'draw' — a Custom shape needs its placeholder outline hidden (see
      // StoreCanvas's outlineDrawn check) but shouldn't force Draw mode immediately: a retailer tracing
      // over a real floorplan photo needs to upload and calibrate it first, which Draw mode's full-canvas
      // click-to-place-a-corner layer would otherwise block entirely. The toolbar's "Draw Outline" button
      // (shown whenever outlineDrawn is false) lets them enter Draw mode whenever they're ready.
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 12, padding: 36, display: 'flex', flexDirection: 'column', gap: 22 }}>

        <div>
          <button onClick={onBack} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: '#5a5a78', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4
          }}>
            ← Back
          </button>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>New Project</div>
          <div style={{ fontSize: 13, color: '#5a5a78' }}>Set up your store before placing fixtures.</div>
        </div>

        <Field label="Store Name">
          <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Store" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
        </Field>

        <Field label="Units">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['meters', 'feet'] as Unit[]).map((u) => (
              <button key={u} onClick={() => handleUnitChange(u)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid',
                borderColor: unit === u ? '#4A90D9' : '#3a3a5a',
                background: unit === u ? 'rgba(74,144,217,0.18)' : 'transparent',
                color: unit === u ? '#4A90D9' : '#7a7a9a',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
              }}>
                {u}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Store Shape">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['rectangle', 'custom'] as StoreShape[]).map((s) => (
              <button key={s} onClick={() => setShape(s)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid',
                borderColor: shape === s ? '#4A90D9' : '#3a3a5a',
                background: shape === s ? 'rgba(74,144,217,0.18)' : 'transparent',
                color: shape === s ? '#4A90D9' : '#7a7a9a',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
              }}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        {shape === 'rectangle' ? (
          <div>
            <div style={{ ...LABEL, marginBottom: 10 }}>Store Size</div>
            <div style={ROW}>
              <Field label={`Width (${unitLabel})`}>
                <input style={{ ...INPUT, width: '100%' }} type="number" min={1} step={0.5}
                  value={width} onChange={(e) => setWidth(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label={`Height (${unitLabel})`}>
                <input style={{ ...INPUT, width: '100%' }} type="number" min={1} step={0.5}
                  value={height} onChange={(e) => setHeight(parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#7a7a9a', lineHeight: 1.5 }}>
            You'll draw the store outline on the canvas after creating the project — click
            to place each corner, type an exact length, and close the loop back at the start.
          </div>
        )}

        <Field label={`Grid Snap (${unitLabel})`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input style={{ ...INPUT, flex: 1 }} type="number"
              min={MIN_GRID_SNAP} max={MAX_GRID_SNAP} step={0.05}
              value={gridSnap}
              onChange={(e) => setGridSnap(parseFloat(e.target.value) || DEFAULT_GRID_SNAP)} />
            <span style={{ fontSize: 11, color: '#5a5a78', whiteSpace: 'nowrap' }}>
              {MIN_GRID_SNAP} – {MAX_GRID_SNAP} {unitLabel}
            </span>
          </div>
        </Field>

        {error && <div style={{ fontSize: 12, color: '#e74c3c' }}>{error}</div>}

        <button onClick={handleSubmit} style={{
          padding: '11px 0', borderRadius: 7, border: 'none',
          background: '#4A90D9', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', marginTop: 4
        }}>
          Create Project
        </button>
      </div>
    </div>
  )
}
