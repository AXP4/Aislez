import React, { useState, useEffect } from 'react'
import { useProjectStore, MIN_GRID_SNAP, MAX_GRID_SNAP } from '../store/projectStore'
import { useCanvasStore } from '../store/canvasStore'
import type { Unit } from '../types'

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: '#12121f', border: '1px solid #3a3a5a',
  borderRadius: 6, color: '#e0e0f0', fontSize: 14, outline: 'none'
}

const LABEL: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#9090a8',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={LABEL}>{label}</div>
      {children}
    </div>
  )
}

interface Props { onClose: () => void }

export default function ProjectSettingsModal({ onClose }: Props): React.ReactElement {
  const { settings, updateSettings } = useProjectStore()
  const { scaleAllFixtures } = useCanvasStore()

  const [name, setName]         = useState(settings?.name         ?? '')
  const [unit, setUnit]         = useState<Unit>(settings?.unit   ?? 'meters')
  const [width, setWidth]       = useState(settings?.storeWidth   ?? 30)
  const [height, setHeight]     = useState(settings?.storeHeight  ?? 20)
  const [gridSnap, setGridSnap] = useState(settings?.gridSnap     ?? 0.1)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (settings) {
      setName(settings.name); setUnit(settings.unit)
      setWidth(settings.storeWidth); setHeight(settings.storeHeight)
      setGridSnap(settings.gridSnap)
    }
  }, [settings])

  const handleUnitToggle = (next: Unit): void => {
    if (next === unit) return
    const factor = next === 'feet' ? 3.28084 : 1 / 3.28084
    setWidth( parseFloat((width  * factor).toFixed(1)))
    setHeight(parseFloat((height * factor).toFixed(1)))
    setGridSnap(Math.min(MAX_GRID_SNAP, Math.max(MIN_GRID_SNAP,
      parseFloat((gridSnap * factor).toFixed(2)))))
    setUnit(next)
  }

  const unitLabel = unit === 'meters' ? 'm' : 'ft'

  const handleSave = (): void => {
    if (!name.trim())              { setError('Store name is required.'); return }
    if (width <= 0 || height <= 0) { setError('Width and height must be greater than 0.'); return }
    if (gridSnap < MIN_GRID_SNAP || gridSnap > MAX_GRID_SNAP) {
      setError(`Snap must be between ${MIN_GRID_SNAP} and ${MAX_GRID_SNAP} ${unitLabel}.`); return
    }

    // If unit changed, scale all fixture positions/dimensions (clears undo history)
    if (settings && unit !== settings.unit) {
      const factor = unit === 'feet' ? 3.28084 : 1 / 3.28084
      scaleAllFixtures(factor)
    }

    // Only regenerate the outline (as a plain rectangle) when the declared size or
    // unit actually changed — otherwise a hand-drawn custom shape would silently
    // flatten back to a rectangle just from renaming the store or tweaking snap.
    const dimensionsChanged = !settings || width !== settings.storeWidth || height !== settings.storeHeight || unit !== settings.unit
    const outlineUpdate = dimensionsChanged
      ? { storeOutline: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] }
      : {}

    updateSettings({ name: name.trim(), unit, storeWidth: width, storeHeight: height, gridSnap, ...outlineUpdate })
    onClose()
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
    >
      <div style={{
        width: 400, background: '#1a1a2e', border: '1px solid #2e2e4a',
        borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', gap: 20
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0' }}>Project Settings</div>

        <Field label="Store Name">
          <input style={INPUT} value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
        </Field>

        <Field label="Units">
          <div style={{ display: 'flex', gap: 10 }}>
            {(['meters', 'feet'] as Unit[]).map((u) => (
              <button key={u} onClick={() => handleUnitToggle(u)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid',
                borderColor: unit === u ? '#4A90D9' : '#3a3a5a',
                background: unit === u ? 'rgba(74,144,217,0.18)' : 'transparent',
                color: unit === u ? '#4A90D9' : '#7a7a9a',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
              }}>{u}</button>
            ))}
          </div>
          {settings && unit !== settings.unit && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#c0883a' }}>
              Changing units will convert all fixture positions. Undo history will be cleared.
            </div>
          )}
        </Field>

        <div>
          <div style={{ ...LABEL, marginBottom: 10 }}>Store Size</div>
          <div style={{ display: 'flex', gap: 12 }}>
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

        <Field label={`Grid Snap (${unitLabel})`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input style={{ ...INPUT, flex: 1 }} type="number"
              min={MIN_GRID_SNAP} max={MAX_GRID_SNAP} step={0.05}
              value={gridSnap}
              onChange={(e) => setGridSnap(parseFloat(e.target.value) || MIN_GRID_SNAP)} />
            <span style={{ fontSize: 11, color: '#5a5a78', whiteSpace: 'nowrap' }}>
              {MIN_GRID_SNAP} – {MAX_GRID_SNAP} {unitLabel}
            </span>
          </div>
        </Field>

        {error && <div style={{ fontSize: 12, color: '#e74c3c' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '9px 0', borderRadius: 6,
            border: '1px solid #3a3a5a', background: 'transparent',
            color: '#7a7a9a', fontSize: 13, cursor: 'pointer'
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: '9px 0', borderRadius: 6, border: 'none',
            background: '#4A90D9', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}
