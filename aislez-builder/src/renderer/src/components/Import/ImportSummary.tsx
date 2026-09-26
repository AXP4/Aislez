import React from 'react'

interface Props {
  totalImported: number
  linkedCount: number
  unlinkedCount: number
  skippedCount: number
  onDone: () => void
}

export default function ImportSummary({ totalImported, linkedCount, unlinkedCount, skippedCount, onDone }: Props): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>Import Complete</div>
        <div style={{ fontSize: 13, color: '#5a5a78' }}>Products are now in the Products tab of the sidebar.</div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '14px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid #2e2e4a' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e0e0f0' }}>{totalImported}</div>
          <div style={{ fontSize: 11, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Imported</div>
        </div>
        <div style={{ flex: 1, padding: '14px 12px', borderRadius: 8, background: 'rgba(39,174,96,0.1)', border: '1px solid rgba(39,174,96,0.3)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#27ae60' }}>{linkedCount}</div>
          <div style={{ fontSize: 11, color: '#7a9a85', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Linked</div>
        </div>
        <div style={{ flex: 1, padding: '14px 12px', borderRadius: 8, background: unlinkedCount > 0 ? 'rgba(230,126,34,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${unlinkedCount > 0 ? 'rgba(230,126,34,0.3)' : '#2e2e4a'}` }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: unlinkedCount > 0 ? '#e67e22' : '#e0e0f0' }}>{unlinkedCount}</div>
          <div style={{ fontSize: 11, color: unlinkedCount > 0 ? '#c9a06a' : '#7a7a9a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unlinked</div>
        </div>
      </div>

      {unlinkedCount > 0 && (
        <div style={{ fontSize: 12, color: '#c9a06a' }}>
          Unlinked products have no fixture with a matching location code yet — place or code a fixture to match, then re-import.
        </div>
      )}

      {skippedCount > 0 && (
        <div style={{ fontSize: 12, color: '#7a7a9a' }}>
          {skippedCount} row{skippedCount === 1 ? '' : 's'} skipped — no Item Name value, so there was nothing to import.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onDone} style={{
          padding: '9px 18px', borderRadius: 6, border: 'none',
          background: '#4A90D9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
        }}>
          Done
        </button>
      </div>
    </div>
  )
}
