import React, { useState } from 'react'
import { openProject } from '../utils/fileActions'

const CARD: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
  width: 170, padding: '28px 16px', borderRadius: 10,
  border: '1px solid #3a3a5a', background: '#12121f',
  color: '#e0e0f0', fontSize: 14, fontWeight: 600, cursor: 'pointer'
}

export default function StartScreen({ onNewProject }: { onNewProject: () => void }): React.ReactElement {
  const [opening, setOpening] = useState(false)

  const handleOpen = async (): Promise<void> => {
    setOpening(true)
    await openProject()
    setOpening(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#e0e0f0', marginBottom: 6 }}>Aislez Builder</div>
        <div style={{ fontSize: 13, color: '#5a5a78' }}>Map a store, or pick up where you left off.</div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <button style={CARD} onClick={onNewProject}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4A90D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Project
        </button>
        <button style={{ ...CARD, opacity: opening ? 0.6 : 1 }} onClick={handleOpen} disabled={opening}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          {opening ? 'Opening…' : 'Open Project'}
        </button>
      </div>
    </div>
  )
}
