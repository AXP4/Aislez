import React, { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useCanvasStore } from '../../store/canvasStore'
import type { CustomFixtureType } from '../../types'
import { WALL_COLOR } from '../../types'

// ─── Color palette ────────────────────────────────────────────────────────────

const SWATCH_COLORS: string[] = [
  '#FF5252','#F44336','#D32F2F','#B71C1C','#FF1744','#FF6B6B','#EE5A24','#C0392B','#E74C3C','#A93226',
  '#FF9800','#F57C00','#E65100','#FF6D00','#FFAB40','#FB8C00','#E67E22','#D35400','#FF8C00','#FF7043',
  '#FFD600','#FFEA00','#F9CA24','#FFC107','#FFB300','#FF8F00','#F1C40F','#D4AC0D','#FFF176','#FDCB6E',
  '#00C853','#2ECC71','#27AE60','#1E8449','#00E676','#4CAF50','#388E3C','#2E7D32','#43A047','#66BB6A',
  '#00BCD4','#00ACC1','#0097A7','#26C6DA','#1ABC9C','#16A085','#00838F','#004D40','#48C9B0','#76D7C4',
  '#2196F3','#1976D2','#1565C0','#0D47A1','#42A5F5','#3498DB','#2980B9','#1A5276','#5DADE2','#4A90D9',
  '#9C27B0','#7B1FA2','#6A1B9A','#CE93D8','#8E44AD','#9B59B6','#7D3C98','#6C3483','#A569BD','#AB47BC',
  '#E91E63','#C2185B','#880E4F','#F06292','#FF4081','#F48FB1','#D81B60','#EC407A','#FF80AB','#FF69B4',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function autoAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'CU'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function makeDragPreview(label: string, color: string, widthPx: number, heightPx: number): HTMLCanvasElement {
  const w = Math.max(widthPx, 20)
  const h = Math.max(heightPx, 20)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 4); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  const fontSize = Math.max(9, Math.min(13, Math.min(h, w) * 0.35))
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
  return canvas
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const itemBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '7px 10px', borderRadius: 6, cursor: 'grab',
  background: 'rgba(255,255,255,0.06)', marginBottom: 4,
  transition: 'background 0.15s'
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid #3a3a5a',
  borderRadius: 4, padding: '5px 7px', color: '#dde0e8', fontSize: 12,
  outline: 'none', width: '100%', boxSizing: 'border-box'
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#666', padding: '0 3px', lineHeight: 1, flexShrink: 0
}

// ─── ColorPicker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }): React.ReactElement {
  const [hexInput, setHexInput] = useState(value)
  const handleHex = (v: string): void => {
    setHexInput(v)
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v)
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, marginBottom: 8 }}>
        {SWATCH_COLORS.map(c => (
          <div key={c} title={c} onClick={() => { onChange(c); setHexInput(c) }} style={{
            aspectRatio: '1', borderRadius: 2, background: c, cursor: 'pointer',
            border: value === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.15)',
            boxSizing: 'border-box'
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: 3, background: value, flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
        <input value={hexInput} onChange={(e) => handleHex(e.target.value)} placeholder="#000000" maxLength={7}
          style={{ ...inputStyle, width: 'auto', flex: 1 }} />
      </div>
    </div>
  )
}

// ─── FixtureForm (shared for create + edit) ───────────────────────────────────

interface FixtureFormProps {
  initial?: Partial<CustomFixtureType>
  onConfirm: (values: Omit<CustomFixtureType, 'id'>) => void
  onCancel: () => void
}

function FixtureForm({ initial, onConfirm, onCancel }: FixtureFormProps): React.ReactElement {
  const { settings } = useProjectStore()
  const unitSuffix = settings?.unit === 'feet' ? 'ft' : 'm'

  const [name,       setName]       = useState(initial?.name   ?? '')
  const [widthStr,   setWidthStr]   = useState(String(initial?.width  ?? '1.0'))
  const [heightStr,  setHeightStr]  = useState(String(initial?.height ?? '1.0'))
  const [color,      setColor]      = useState(initial?.color  ?? '#4A90D9')
  const [showPicker, setShowPicker] = useState(false)

  const canConfirm = name.trim().length > 0

  const handleConfirm = (): void => {
    if (!canConfirm) return
    const w = parseFloat(widthStr), h = parseFloat(heightStr)
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return
    onConfirm({ name: name.trim(), width: w, height: h, color, abbrev: autoAbbrev(name) })
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 10, marginBottom: 4 }}>
      <div style={{ marginBottom: 7 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel() }}
          autoFocus style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#7a7a9a', marginBottom: 3 }}>W ({unitSuffix})</div>
          <input type="number" min="0.1" step="0.1" value={widthStr}
            onChange={(e) => setWidthStr(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#7a7a9a', marginBottom: 3 }}>H ({unitSuffix})</div>
          <input type="number" min="0.1" step="0.1" value={heightStr}
            onChange={(e) => setHeightStr(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#7a7a9a', marginBottom: 3 }}>Color</div>
        <div onClick={() => setShowPicker(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '5px 7px', borderRadius: 4, border: '1px solid #3a3a5a',
          background: 'rgba(255,255,255,0.08)'
        }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#aaa', flex: 1 }}>{color}</span>
          <span style={{ fontSize: 10, color: '#666' }}>{showPicker ? '▲' : '▼'}</span>
        </div>
        {showPicker && <div style={{ marginTop: 6 }}><ColorPicker value={color} onChange={setColor} /></div>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleConfirm} disabled={!canConfirm} style={{
          flex: 1, padding: '6px 0', borderRadius: 4, border: 'none',
          cursor: canConfirm ? 'pointer' : 'default',
          background: '#4A90D9', color: '#fff', fontSize: 12, fontWeight: 600,
          opacity: canConfirm ? 1 : 0.4
        }}>
          {initial ? 'Save' : 'Add'}
        </button>
        <button onClick={onCancel} style={{
          flex: 1, padding: '6px 0', borderRadius: 4,
          border: '1px solid #3a3a5a', background: 'transparent',
          color: '#aaa', fontSize: 12, cursor: 'pointer'
        }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── FixtureItem ──────────────────────────────────────────────────────────────

interface FixtureItemProps {
  customType: CustomFixtureType
  onEdit:   (id: string) => void
  onDelete: (id: string) => void
}

function FixtureItem({ customType, onEdit, onDelete }: FixtureItemProps): React.ReactElement {
  const { pixelsPerUnit, formatUnitShort } = useProjectStore()
  const [hovered, setHovered] = useState(false)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData('fixtureType', 'custom')
    e.dataTransfer.setData('customTypeId', customType.id)
    e.dataTransfer.effectAllowed = 'copy'
    const pw = Math.round(customType.width  * pixelsPerUnit)
    const ph = Math.round(customType.height * pixelsPerUnit)
    const canvas = makeDragPreview(customType.abbrev, customType.color, pw, ph)
    e.dataTransfer.setDragImage(canvas, pw / 2, ph / 2)
    setTimeout(() => canvas.remove(), 0)
  }

  return (
    <div draggable onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...itemBase, background: hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' }}
    >
      <div style={{ width: 24, height: 12, borderRadius: 3, background: customType.color, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: '#dde0e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customType.name}
        </span>
        <span style={{ fontSize: 10, color: '#555570' }}>
          {formatUnitShort(customType.width)} × {formatUnitShort(customType.height)}
        </span>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); onEdit(customType.id) }}
            title="Edit" style={{ ...iconBtn, fontSize: 13 }}>✎</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(customType.id) }}
            title="Delete" style={{ ...iconBtn, fontSize: 16 }}>×</button>
        </div>
      )}
    </div>
  )
}

// ─── WallDefaultsForm ─────────────────────────────────────────────────────────
// Wall is a fixed system type — only its default placement size is editable,
// not its name or color (those are constant).

interface WallDefaultsFormProps {
  initial: { width: number; height: number }
  onConfirm: (values: { width: number; height: number }) => void
  onCancel: () => void
}

function WallDefaultsForm({ initial, onConfirm, onCancel }: WallDefaultsFormProps): React.ReactElement {
  const { settings } = useProjectStore()
  const unitSuffix = settings?.unit === 'feet' ? 'ft' : 'm'

  const [widthStr,  setWidthStr]  = useState(String(initial.width))
  const [heightStr, setHeightStr] = useState(String(initial.height))

  const handleConfirm = (): void => {
    const w = parseFloat(widthStr), h = parseFloat(heightStr)
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return
    onConfirm({ width: w, height: h })
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 10, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#7a7a9a', marginBottom: 3 }}>Length ({unitSuffix})</div>
          <input type="number" min="0.05" step="0.1" value={widthStr}
            onChange={(e) => setWidthStr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel() }}
            autoFocus style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#7a7a9a', marginBottom: 3 }}>Thickness ({unitSuffix})</div>
          <input type="number" min="0.05" step="0.05" value={heightStr}
            onChange={(e) => setHeightStr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel() }}
            style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleConfirm} style={{
          flex: 1, padding: '6px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: WALL_COLOR, color: '#fff', fontSize: 12, fontWeight: 600
        }}>
          Save
        </button>
        <button onClick={onCancel} style={{
          flex: 1, padding: '6px 0', borderRadius: 4,
          border: '1px solid #3a3a5a', background: 'transparent',
          color: '#aaa', fontSize: 12, cursor: 'pointer'
        }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── WallItem ─────────────────────────────────────────────────────────────────

function WallItem(): React.ReactElement {
  const { formatUnitShort, wallDefaults, updateWallDefaults } = useProjectStore()
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData('itemType', 'wall')
    e.dataTransfer.effectAllowed = 'copy'
    const canvas = makeDragPreview('Wall', WALL_COLOR, 80, 16)
    e.dataTransfer.setDragImage(canvas, 40, 8)
    setTimeout(() => canvas.remove(), 0)
  }

  if (editing) {
    return (
      <WallDefaultsForm
        initial={wallDefaults}
        onConfirm={(values) => { updateWallDefaults(values); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...itemBase, background: hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' }}
    >
      <div style={{ width: 24, height: 8, borderRadius: 2, background: WALL_COLOR, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: '#dde0e8' }}>Wall</span>
        <span style={{ fontSize: 10, color: '#555570' }}>
          {formatUnitShort(wallDefaults.width)} × {formatUnitShort(wallDefaults.height)}
        </span>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            title="Edit default size" style={{ ...iconBtn, fontSize: 13 }}>✎</button>
        </div>
      )}
    </div>
  )
}

// ─── EntranceItem ───────────────────────────────────────────────────────────

function EntranceItem(): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData('itemType', 'entrance')
    e.dataTransfer.effectAllowed = 'copy'
    const canvas = makeDragPreview('Door', WALL_COLOR, 80, 16)
    e.dataTransfer.setDragImage(canvas, 40, 8)
    setTimeout(() => canvas.remove(), 0)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...itemBase, background: hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)' }}
    >
      <div style={{
        width: 24, height: 8, borderRadius: 2, flexShrink: 0,
        background: WALL_COLOR, position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', left: 8, top: 0, width: 8, height: '100%', background: '#ffffff' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: '#dde0e8' }}>Entrance</span>
        <span style={{ fontSize: 10, color: '#555570' }}>Drop onto a wall</span>
      </div>
    </div>
  )
}

// ─── FixtureLibrary ───────────────────────────────────────────────────────────

export default function FixtureLibrary(): React.ReactElement {
  const { customFixtureTypes, addCustomFixtureType, updateCustomFixtureType, deleteCustomFixtureType } = useProjectStore()
  const [creating,  setCreating]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleDelete = (id: string): void => {
    const inUse = useCanvasStore.getState().fixtures.filter(f => f.customTypeId === id).length
    if (inUse > 0) {
      if (!window.confirm(`Used by ${inUse} object${inUse > 1 ? 's' : ''} on canvas. Delete anyway?`)) return
    }
    deleteCustomFixtureType(id)
    if (editingId === id) setEditingId(null)
  }

  const handleEdit = (id: string): void => {
    setCreating(false)
    setEditingId(id)
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7a7a9a', marginBottom: 8 }}>
        Walls
      </div>
      <WallItem />
      <EntranceItem />
      <div style={{ height: 1, background: '#2a2a44', margin: '12px 0 10px' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7a7a9a' }}>
          Fixtures
        </div>
        {!creating && !editingId && (
          <button onClick={() => setCreating(true)} title="Add fixture type" style={{
            background: 'rgba(74,144,217,0.18)', border: '1px solid rgba(74,144,217,0.4)',
            borderRadius: 4, color: '#4A90D9', fontSize: 14, padding: '0 7px',
            cursor: 'pointer', lineHeight: '20px'
          }}>+</button>
        )}
      </div>

      {customFixtureTypes.map(ct =>
        editingId === ct.id ? (
          <FixtureForm
            key={ct.id}
            initial={ct}
            onConfirm={(values) => { updateCustomFixtureType(ct.id, values); setEditingId(null) }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <FixtureItem key={ct.id} customType={ct} onEdit={handleEdit} onDelete={handleDelete} />
        )
      )}

      {creating && (
        <FixtureForm
          onConfirm={(values) => { addCustomFixtureType(values); setCreating(false) }}
          onCancel={() => setCreating(false)}
        />
      )}

      {customFixtureTypes.length === 0 && !creating && (
        <div style={{ fontSize: 11, color: '#444460', textAlign: 'center', padding: '4px 0' }}>
          No fixtures yet
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: '#555570', textAlign: 'center', lineHeight: 1.5 }}>
        Drag onto canvas to place
      </div>
    </div>
  )
}
