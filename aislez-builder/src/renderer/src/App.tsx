import React, { useState, useEffect, useCallback } from 'react'
import StoreCanvas from './components/Canvas/StoreCanvas'
import FixtureLibrary from './components/Sidebar/FixtureLibrary'
import NewProjectDialog from './components/NewProjectDialog'
import ProjectSettingsModal from './components/ProjectSettingsModal'
import { useUiStore } from './store/uiStore'
import { useCanvasStore } from './store/canvasStore'
import { useProjectStore } from './store/projectStore'
import { getChainMembers, parseCode } from './utils/chain'
import { WALL_COLOR } from './types'

// ── Toolbar ─────────────────────────────────────────────────────────────────

const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '0 9px', height: 26, borderRadius: 4, fontSize: 12,
  cursor: 'pointer', border: '1px solid #3a3a5a',
  background: 'transparent', color: '#9090a8'
}
const BTN_ACTIVE: React.CSSProperties = {
  ...BTN, borderColor: '#4A90D9', background: 'rgba(74,144,217,0.15)', color: '#4A90D9'
}
const BTN_DANGER: React.CSSProperties = {
  ...BTN, borderColor: '#c0392b', background: 'rgba(192,57,43,0.15)', color: '#e74c3c'
}
const BTN_ICON: React.CSSProperties = {
  ...BTN, padding: '0', width: 28
}

function IconBtn({
  onClick, title, disabled, children
}: {
  onClick: () => void
  title?: string
  disabled?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{ ...BTN_ICON, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      {children}
    </button>
  )
}

function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }): React.ReactElement {
  const { gridMode, cycleGridMode, zoom, zoomIn, zoomOut, resetZoom, fitToStore } = useUiStore()
  const {
    selectedFixtureId, selectedChainAnchor, multiSelectedIds,
    deleteFixture, rotateFixture, past, future, undo, redo,
    fixtures, moveFixture, moveChain, setFixtureCode,
    deleteChain, rotateChain, duplicateSelected, deleteMulti, rotateMulti, moveMulti,
    walls, selectedWallId, deleteWall, rotateWall, moveWall, resizeWall
  } = useCanvasStore()
  const { settings, formatUnitShort, pixelsPerUnit } = useProjectStore()

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  const selectedFixture  = fixtures.find(f => f.id === selectedFixtureId) ?? null
  const anchorFixture    = fixtures.find(f => f.id === selectedChainAnchor) ?? null
  // The fixture whose X/Y/code we show in the toolbar
  const displayFixture   = selectedFixture ?? anchorFixture
  const activeId         = selectedFixtureId ?? selectedChainAnchor ?? null
  const isChainMode      = !selectedFixtureId && !!selectedChainAnchor
  const isMultiMode      = multiSelectedIds.length > 0
  const chainIds         = selectedChainAnchor ? getChainMembers(fixtures, selectedChainAnchor).map(f => f.id) : []

  const unitLabel = settings?.unit === 'meters' ? 'm' : 'ft'
  const gridSnap  = settings?.gridSnap ?? 0.1

  // ── Position inputs ────────────────────────────────────────────────────────
  const [posX, setPosX] = useState('')
  const [posY, setPosY] = useState('')
  useEffect(() => {
    if (displayFixture) {
      setPosX(String(parseFloat(displayFixture.x.toFixed(2))))
      setPosY(String(parseFloat(displayFixture.y.toFixed(2))))
    } else {
      setPosX('')
      setPosY('')
    }
  }, [activeId, displayFixture?.x, displayFixture?.y])

  // ── Multi-selection position inputs ────────────────────────────────────────
  const [multiPosX, setMultiPosX] = useState('')
  const [multiPosY, setMultiPosY] = useState('')

  useEffect(() => {
    if (!isMultiMode) { setMultiPosX(''); setMultiPosY(''); return }
    const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id))
    if (mfs.length === 0) return
    const minX = Math.min(...mfs.map(f => f.x))
    const minY = Math.min(...mfs.map(f => f.y))
    setMultiPosX(String(Math.round(minX * 100) / 100))
    setMultiPosY(String(Math.round(minY * 100) / 100))
  }, [multiSelectedIds, fixtures, isMultiMode])

  const commitMultiX = (): void => {
    const val = parseFloat(multiPosX)
    if (isNaN(val)) { /* reset */ const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id)); if (mfs.length) setMultiPosX(String(Math.round(Math.min(...mfs.map(f => f.x)) * 100) / 100)); return }
    const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id))
    if (mfs.length === 0) return
    const dx = Math.round((val - Math.min(...mfs.map(f => f.x))) * 100) / 100
    if (dx !== 0) moveMulti(multiSelectedIds, dx, 0)
  }
  const commitMultiY = (): void => {
    const val = parseFloat(multiPosY)
    if (isNaN(val)) { const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id)); if (mfs.length) setMultiPosY(String(Math.round(Math.min(...mfs.map(f => f.y)) * 100) / 100)); return }
    const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id))
    if (mfs.length === 0) return
    const dy = Math.round((val - Math.min(...mfs.map(f => f.y))) * 100) / 100
    if (dy !== 0) moveMulti(multiSelectedIds, 0, dy)
  }
  const liveCommitMulti = (val: string, axis: 'x' | 'y'): void => {
    const t = val.trim()
    if (t === '' || t === '-' || t.endsWith('.')) return
    const v = parseFloat(t)
    if (isNaN(v)) return
    const mfs = fixtures.filter(f => multiSelectedIds.includes(f.id))
    if (mfs.length === 0) return
    const current = Math.min(...mfs.map(f => axis === 'x' ? f.x : f.y))
    const d = Math.round((v - current) * 100) / 100
    if (d !== 0) moveMulti(multiSelectedIds, axis === 'x' ? d : 0, axis === 'y' ? d : 0)
  }

  const applyMove = (axis: 'x' | 'y', v: number): void => {
    if (!displayFixture) return
    if (isChainMode && selectedChainAnchor) {
      const dx = axis === 'x' ? v - displayFixture.x : 0
      const dy = axis === 'y' ? v - displayFixture.y : 0
      const chainIds = getChainMembers(fixtures, selectedChainAnchor).map(f => f.id)
      moveChain(chainIds, dx, dy)
    } else if (selectedFixtureId && selectedFixture) {
      if (axis === 'x') moveFixture(selectedFixtureId, v, selectedFixture.y)
      else moveFixture(selectedFixtureId, selectedFixture.x, v)
    }
  }

  const liveCommit = (val: string, axis: 'x' | 'y'): void => {
    const t = val.trim()
    if (t === '' || t === '-' || t.endsWith('.')) return
    const v = parseFloat(t)
    if (isNaN(v)) return
    applyMove(axis, v)
  }

  const commitX = (): void => {
    const v = parseFloat(posX)
    if (!isNaN(v)) applyMove('x', v)
    else if (displayFixture) setPosX(String(parseFloat(displayFixture.x.toFixed(2))))
  }
  const commitY = (): void => {
    const v = parseFloat(posY)
    if (!isNaN(v)) applyMove('y', v)
    else if (displayFixture) setPosY(String(parseFloat(displayFixture.y.toFixed(2))))
  }

  // ── Code / Instance inputs ─────────────────────────────────────────────────
  const [codeField, setCodeField]         = useState('')
  const [instanceField, setInstanceField] = useState('')
  // Inline duplicate-prefix confirmation — avoids window.confirm blur side-effects
  const [pendingAssign, setPendingAssign] = useState<{ prefix: string } | null>(null)

  // Instance is read-only when an individual non-head fixture is selected
  const isInstanceReadOnly = !isChainMode && !!selectedFixture?.prevId

  useEffect(() => {
    setPendingAssign(null)
    if (displayFixture?.locationCode) {
      const parsed = parseCode(displayFixture.locationCode)
      if (parsed) {
        setCodeField(parsed.prefix)
        setInstanceField(String(parsed.section))
      } else {
        setCodeField(displayFixture.locationCode)
        setInstanceField('')
      }
    } else {
      setCodeField('')
      setInstanceField('')
    }
  }, [activeId, displayFixture?.locationCode])

  const commitCode = (): void => {
    if (!activeId || pendingAssign) return
    const prefix = codeField.trim().toUpperCase()
    if (!prefix) {
      setFixtureCode(activeId, undefined)
      return
    }

    const instanceNum = parseInt(instanceField.trim() || '1', 10)
    const startSection = !isNaN(instanceNum) && instanceNum >= 1 ? instanceNum : 1
    const fullCode = `${prefix}-${startSection}`

    // Check if this prefix exists on a different chain
    const currentChainIds = new Set(getChainMembers(fixtures, activeId).map(f => f.id))
    const prefixTaken = fixtures.some(f => {
      if (currentChainIds.has(f.id)) return false
      const fp = f.locationCode ? parseCode(f.locationCode) : null
      return fp?.prefix === prefix
    })

    if (prefixTaken) {
      // Recommend the next available section; only override if user hasn't typed a custom number
      const maxSection = fixtures.reduce((max, f) => {
        if (currentChainIds.has(f.id) || !f.locationCode) return max
        const fp = parseCode(f.locationCode)
        return fp?.prefix === prefix ? Math.max(max, fp.section) : max
      }, 0)
      const currentInstance = parseInt(instanceField.trim() || '1', 10)
      if (isNaN(currentInstance) || currentInstance <= 1) {
        setInstanceField(String(maxSection + 1))
      }
      setPendingAssign({ prefix })
      return
    }

    setFixtureCode(activeId, fullCode)
  }

  const confirmAssign = (): void => {
    if (!activeId || !pendingAssign) return
    const instanceNum = parseInt(instanceField.trim() || '1', 10)
    const startSection = !isNaN(instanceNum) && instanceNum >= 1 ? instanceNum : 1
    setFixtureCode(activeId, `${pendingAssign.prefix}-${startSection}`)
    setPendingAssign(null)
  }

  const cancelAssign = (): void => {
    setPendingAssign(null)
    if (displayFixture?.locationCode) {
      const parsed = parseCode(displayFixture.locationCode)
      if (parsed) { setCodeField(parsed.prefix); setInstanceField(String(parsed.section)) }
    } else { setCodeField(''); setInstanceField('') }
  }

  const pendingCode = codeField.trim()
    ? `${codeField.trim().toUpperCase()}-${parseInt(instanceField.trim() || '1', 10) || 1}`
    : undefined
  const isCodeDuplicate = !!pendingCode &&
    fixtures.some((f) => f.id !== activeId && f.locationCode === pendingCode)

  const handleFit = useCallback(() => {
    if (!settings) return
    // Union the nominal store rectangle with whatever's actually been placed —
    // an irregular, multi-sided store can extend past the declared size.
    let minX = 0, minY = 0
    let maxX = settings.storeWidth  * pixelsPerUnit
    let maxY = settings.storeHeight * pixelsPerUnit
    const { fixtures: fs, walls: ws } = useCanvasStore.getState()
    for (const item of [...fs, ...ws]) {
      minX = Math.min(minX, item.x * pixelsPerUnit)
      minY = Math.min(minY, item.y * pixelsPerUnit)
      maxX = Math.max(maxX, (item.x + item.width)  * pixelsPerUnit)
      maxY = Math.max(maxY, (item.y + item.height) * pixelsPerUnit)
    }
    fitToStore(minX, minY, maxX, maxY)
  }, [settings, pixelsPerUnit, fitToStore])

  // ── Wall inputs ────────────────────────────────────────────────────────────
  const selectedWall = walls.find(w => w.id === selectedWallId) ?? null
  const [wallX, setWallX] = useState('')
  const [wallY, setWallY] = useState('')
  const [wallW, setWallW] = useState('')
  const [wallH, setWallH] = useState('')

  useEffect(() => {
    if (selectedWall) {
      setWallX(String(parseFloat(selectedWall.x.toFixed(2))))
      setWallY(String(parseFloat(selectedWall.y.toFixed(2))))
      setWallW(String(parseFloat(selectedWall.width.toFixed(2))))
      setWallH(String(parseFloat(selectedWall.height.toFixed(2))))
    } else {
      setWallX(''); setWallY(''); setWallW(''); setWallH('')
    }
  }, [selectedWallId, selectedWall?.x, selectedWall?.y, selectedWall?.width, selectedWall?.height])

  const commitWallX = (): void => {
    if (!selectedWall) return
    const v = parseFloat(wallX)
    if (isNaN(v)) { setWallX(String(parseFloat(selectedWall.x.toFixed(2)))); return }
    moveWall(selectedWall.id, v, selectedWall.y)
  }
  const commitWallY = (): void => {
    if (!selectedWall) return
    const v = parseFloat(wallY)
    if (isNaN(v)) { setWallY(String(parseFloat(selectedWall.y.toFixed(2)))); return }
    moveWall(selectedWall.id, selectedWall.x, v)
  }
  const commitWallW = (): void => {
    if (!selectedWall) return
    const v = parseFloat(wallW)
    if (isNaN(v) || v <= 0) { setWallW(String(parseFloat(selectedWall.width.toFixed(2)))); return }
    resizeWall(selectedWall.id, selectedWall.x, selectedWall.y, v, selectedWall.height)
  }
  const commitWallH = (): void => {
    if (!selectedWall) return
    const v = parseFloat(wallH)
    if (isNaN(v) || v <= 0) { setWallH(String(parseFloat(selectedWall.height.toFixed(2)))); return }
    resizeWall(selectedWall.id, selectedWall.x, selectedWall.y, selectedWall.width, v)
  }

  const zoomPct = `${Math.round(zoom * 100)}%`

  const SEP = <div style={{ width: 1, height: 18, background: '#2a2a44', margin: '0 2px' }} />

  return (
    <div style={{
      height: 40, background: '#1a1a2e', borderBottom: '1px solid #2a2a44',
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', padding: '0 10px', flexShrink: 0
    }}>

      {/* ── LEFT: brand info + settings + grid ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {settings && (
          <>
            <span style={{ color: '#7a7a9a', fontSize: 13, fontWeight: 600 }}>Aislez</span>
            <span style={{ color: '#2e2e4a' }}>|</span>
            <span style={{ color: '#5a5a78', fontSize: 12 }}>{settings.name}</span>
            <span style={{ color: '#2e2e4a' }}>|</span>
            <span style={{ color: '#444460', fontSize: 11 }}>
              {formatUnitShort(settings.storeWidth)} × {formatUnitShort(settings.storeHeight)}
            </span>
            {SEP}
            <IconBtn onClick={onOpenSettings} title="Project Settings">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
            </IconBtn>
          </>
        )}
        <button onClick={cycleGridMode}
          style={gridMode !== 'off' ? { ...BTN_ACTIVE, minWidth: 78 } : { ...BTN, minWidth: 78 }}>
          {gridMode === 'dots' ? 'Grid: Dots' : gridMode === 'lines' ? 'Grid: Lines' : 'Grid: Off'}
        </button>
      </div>

      {/* ── CENTER: fixture properties ── only when a fixture is selected ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {activeId !== null && (
          <>
            <span style={{ fontSize: 11, color: '#5a5a78' }}>X</span>
            <input
              type="number" step={gridSnap} value={posX}
              onChange={e => { setPosX(e.target.value); liveCommit(e.target.value, 'x') }}
              onBlur={commitX}
              onKeyDown={e => e.key === 'Enter' && commitX()}
              title={`X position (${unitLabel})${isChainMode ? ' — anchor fixture' : ''}`}
              style={{ ...BTN, width: 58, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 11, color: '#5a5a78' }}>{unitLabel}</span>
            <span style={{ fontSize: 11, color: '#5a5a78', marginLeft: 4 }}>Y</span>
            <input
              type="number" step={gridSnap} value={posY}
              onChange={e => { setPosY(e.target.value); liveCommit(e.target.value, 'y') }}
              onBlur={commitY}
              onKeyDown={e => e.key === 'Enter' && commitY()}
              title={`Y position (${unitLabel})${isChainMode ? ' — anchor fixture' : ''}`}
              style={{ ...BTN, width: 58, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 11, color: '#5a5a78' }}>{unitLabel}</span>
            {SEP}
            {pendingAssign ? (
              <>
                <span style={{ fontSize: 11, color: '#e67e22' }}>
                  "{pendingAssign.prefix}" in use — next #
                </span>
                <input
                  type="number" min={1} value={instanceField}
                  onChange={e => setInstanceField(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmAssign()}
                  title="Starting section number"
                  autoFocus
                  style={{ ...BTN, width: 52, padding: '0 6px' }}
                />
                <button onClick={confirmAssign}
                  style={{ ...BTN, borderColor: '#27ae60', color: '#27ae60', padding: '0 8px' }}>
                  Assign
                </button>
                <button onClick={cancelAssign} style={{ ...BTN, padding: '0 8px' }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, color: '#5a5a78' }}>Code</span>
                <input
                  type="text" value={codeField}
                  onChange={e => setCodeField(e.target.value.toUpperCase())}
                  onBlur={commitCode}
                  onKeyDown={e => e.key === 'Enter' && commitCode()}
                  placeholder="B1"
                  title="Location code prefix (e.g. B1)"
                  style={{
                    ...BTN, width: 52, padding: '0 6px',
                    background: isCodeDuplicate ? 'rgba(231,76,60,0.15)' : 'transparent',
                    borderColor: isCodeDuplicate ? '#e74c3c' : '#3a3a5a',
                    color: isCodeDuplicate ? '#e74c3c' : '#9090a8'
                  }}
                />
                <span style={{ fontSize: 11, color: '#5a5a78' }}>#</span>
                <input
                  type="number" min={1} value={instanceField}
                  onChange={e => !isInstanceReadOnly && setInstanceField(e.target.value)}
                  onBlur={commitCode}
                  onKeyDown={e => e.key === 'Enter' && commitCode()}
                  placeholder="1"
                  title={isInstanceReadOnly
                    ? 'Section number (read-only — set on the chain head)'
                    : 'Starting section number (default 1)'}
                  readOnly={isInstanceReadOnly}
                  style={{
                    ...BTN, width: 46, padding: '0 6px',
                    opacity: isInstanceReadOnly ? 0.45 : 1,
                    cursor: isInstanceReadOnly ? 'default' : 'text'
                  }}
                />
              </>
            )}
            {/* Duplicate / Rotate / Delete for individually selected fixtures */}
            {selectedFixtureId !== null && (
              <>
                {SEP}
                <button onClick={() => duplicateSelected(gridSnap, gridSnap)} title="Duplicate (Ctrl+D)"
                  style={{ ...BTN, gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Duplicate
                </button>
                <button onClick={() => rotateFixture(selectedFixtureId)} title="Rotate 90°"
                  style={{ ...BTN, gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  Rotate
                </button>
                <button onClick={() => deleteFixture(selectedFixtureId)} style={BTN_DANGER}>
                  Delete
                </button>
              </>
            )}
            {/* Duplicate / Rotate / Delete for chain-selected groups */}
            {isChainMode && (
              <>
                {SEP}
                <button onClick={() => duplicateSelected(gridSnap, gridSnap)} title="Duplicate chain (Ctrl+D)"
                  style={{ ...BTN, gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Duplicate
                </button>
                <button onClick={() => rotateChain(chainIds)} title="Rotate chain 90°"
                  style={{ ...BTN, gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  Rotate
                </button>
                <button onClick={() => deleteChain(chainIds)} style={BTN_DANGER}>
                  Delete Chain
                </button>
              </>
            )}
          </>
        )}
        {/* Multi-selection toolbar — outside activeId gate */}
        {isMultiMode && (
          <>
            {SEP}
            <span style={{ fontSize: 11, color: '#6a6a88', paddingRight: 4 }}>
              {multiSelectedIds.length} selected
            </span>
            {/* X input */}
            <span style={{ fontSize: 11, color: '#6a6a88' }}>X</span>
            <input
              value={multiPosX}
              onChange={e => { setMultiPosX(e.target.value); liveCommitMulti(e.target.value, 'x') }}
              onBlur={commitMultiX}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitMultiX(); (e.target as HTMLInputElement).blur() }
                if (e.key === 'ArrowUp')   { e.preventDefault(); const v = (parseFloat(multiPosX) || 0) + gridSnap; setMultiPosX(String(Math.round(v*100)/100)); moveMulti(multiSelectedIds, gridSnap, 0) }
                if (e.key === 'ArrowDown') { e.preventDefault(); const v = (parseFloat(multiPosX) || 0) - gridSnap; setMultiPosX(String(Math.round(v*100)/100)); moveMulti(multiSelectedIds, -gridSnap, 0) }
              }}
              style={{ width: 52, height: 22, padding: '0 4px', borderRadius: 3, border: '1px solid #3a3a5a', background: '#0f0f1e', color: '#dde0e8', fontSize: 11, textAlign: 'center' }}
            />
            <span style={{ fontSize: 10, color: '#4a4a62' }}>{unitLabel}</span>
            {/* Y input */}
            <span style={{ fontSize: 11, color: '#6a6a88' }}>Y</span>
            <input
              value={multiPosY}
              onChange={e => { setMultiPosY(e.target.value); liveCommitMulti(e.target.value, 'y') }}
              onBlur={commitMultiY}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitMultiY(); (e.target as HTMLInputElement).blur() }
                if (e.key === 'ArrowUp')   { e.preventDefault(); const v = (parseFloat(multiPosY) || 0) - gridSnap; setMultiPosY(String(Math.round(v*100)/100)); moveMulti(multiSelectedIds, 0, -gridSnap) }
                if (e.key === 'ArrowDown') { e.preventDefault(); const v = (parseFloat(multiPosY) || 0) + gridSnap; setMultiPosY(String(Math.round(v*100)/100)); moveMulti(multiSelectedIds, 0, gridSnap) }
              }}
              style={{ width: 52, height: 22, padding: '0 4px', borderRadius: 3, border: '1px solid #3a3a5a', background: '#0f0f1e', color: '#dde0e8', fontSize: 11, textAlign: 'center' }}
            />
            <span style={{ fontSize: 10, color: '#4a4a62' }}>{unitLabel}</span>
            {SEP}
            {/* Rotate */}
            <IconBtn onClick={() => rotateMulti(multiSelectedIds)} title="Rotate 90° clockwise">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6"/><path d="M21 13a9 9 0 11-3-7.7L21 8"/>
              </svg>
            </IconBtn>
            {/* Duplicate */}
            <button onClick={() => duplicateSelected(gridSnap, gridSnap)} title="Duplicate selection (Ctrl+D)"
              style={{ ...BTN, gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Duplicate
            </button>
            {/* Delete */}
            <button onClick={() => deleteMulti(multiSelectedIds)} style={BTN_DANGER}>
              Delete {multiSelectedIds.length}
            </button>
          </>
        )}
        {/* ── Wall parameters ── only when a wall is selected ── */}
        {selectedWallId && selectedWall && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            borderLeft: `2px solid ${WALL_COLOR}`,
            background: 'rgba(44,62,80,0.18)',
            borderRadius: '0 4px 4px 0',
            paddingLeft: 10, paddingRight: 6,
            marginLeft: 2, height: 28
          }}>
            <span style={{ fontSize: 10, color: '#7a95a8', fontWeight: 600, letterSpacing: '0.04em' }}>WALL</span>
            {SEP}
            <span style={{ fontSize: 11, color: '#7a95a8' }}>X</span>
            <input
              type="number" step={gridSnap} value={wallX}
              onChange={e => setWallX(e.target.value)}
              onBlur={commitWallX}
              onKeyDown={e => { if (e.key === 'Enter') commitWallX() }}
              title={`X position (${unitLabel})`}
              style={{ ...BTN, width: 58, padding: '0 6px', borderColor: WALL_COLOR + '99', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 11, color: '#7a95a8', marginLeft: 2 }}>Y</span>
            <input
              type="number" step={gridSnap} value={wallY}
              onChange={e => setWallY(e.target.value)}
              onBlur={commitWallY}
              onKeyDown={e => { if (e.key === 'Enter') commitWallY() }}
              title={`Y position (${unitLabel})`}
              style={{ ...BTN, width: 58, padding: '0 6px', borderColor: WALL_COLOR + '99', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 10, color: '#7a95a8' }}>{unitLabel}</span>
            {SEP}
            <span style={{ fontSize: 11, color: '#7a95a8' }}>L</span>
            <input
              type="number" step={gridSnap} min={0.01} value={wallW}
              onChange={e => setWallW(e.target.value)}
              onBlur={commitWallW}
              onKeyDown={e => { if (e.key === 'Enter') commitWallW() }}
              title={`Length (${unitLabel})`}
              style={{ ...BTN, width: 58, padding: '0 6px', borderColor: WALL_COLOR + '99', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 11, color: '#7a95a8' }}>T</span>
            <input
              type="number" step={gridSnap} min={0.01} value={wallH}
              onChange={e => setWallH(e.target.value)}
              onBlur={commitWallH}
              onKeyDown={e => { if (e.key === 'Enter') commitWallH() }}
              title={`Thickness (${unitLabel})`}
              style={{ ...BTN, width: 58, padding: '0 6px', borderColor: WALL_COLOR + '99', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ fontSize: 10, color: '#7a95a8' }}>{unitLabel}</span>
            {SEP}
            <button onClick={() => duplicateSelected(gridSnap, gridSnap)} title="Duplicate (Ctrl+D)"
              style={{ ...BTN, gap: 5, borderColor: WALL_COLOR + 'bb', color: '#7a95a8' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Duplicate
            </button>
            <button onClick={() => rotateWall(selectedWallId)} title="Rotate 90° (swap length and thickness)"
              style={{ ...BTN, gap: 5, borderColor: WALL_COLOR + 'bb', color: '#7a95a8' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Rotate
            </button>
            <button onClick={() => deleteWall(selectedWallId)} style={BTN_DANGER}>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Undo / Redo + Zoom ── always visible ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <IconBtn onClick={undo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
        </IconBtn>
        <IconBtn onClick={redo} title="Redo (Ctrl+Y)" disabled={!canRedo}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13"/>
          </svg>
        </IconBtn>
        {SEP}
        <IconBtn onClick={zoomOut} title="Zoom Out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </IconBtn>
        <button onClick={resetZoom} title="Reset zoom to 100%"
          style={{ ...BTN, minWidth: 44, fontVariantNumeric: 'tabular-nums' }}>
          {zoomPct}
        </button>
        <IconBtn onClick={zoomIn} title="Zoom In">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </IconBtn>
        <IconBtn onClick={handleFit} title="Fit store to screen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
          </svg>
        </IconBtn>
      </div>

    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const { settings } = useProjectStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Global keyboard shortcuts + Ctrl tracking for canvas panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Control') useUiStore.getState().setCtrlHeld(true)
      if (!e.ctrlKey && !e.metaKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); useCanvasStore.getState().undo() }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); useCanvasStore.getState().redo() }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control') useUiStore.getState().setCtrlHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Edit menu IPC actions from main process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipc = (window as any).electron?.ipcRenderer
    const onMenuAction = (_: unknown, action: string): void => {
      const canvas = useCanvasStore.getState()
      if (action === 'undo') canvas.undo()
      else if (action === 'redo') canvas.redo()
      else if (action === 'delete' && canvas.selectedFixtureId) canvas.deleteFixture(canvas.selectedFixtureId)
      // Chain-selected: delete not exposed from menu (double-click to detach first)
    }
    ipc?.on('menu:action', onMenuAction)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      ipc?.removeAllListeners?.('menu:action')
    }
  }, [])

  if (!settings) return <NewProjectDialog />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{
          width: 200, background: '#1e1e30',
          borderRight: '1px solid #2a2a44', overflowY: 'auto', flexShrink: 0
        }}>
          <FixtureLibrary />
        </aside>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <StoreCanvas />
        </main>
      </div>
      {settingsOpen && <ProjectSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
