import React from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-page replacement for window.confirm(). Native confirm() opens an OS-level dialog, and on
 * Windows the Electron window can come back from it without real OS keyboard focus — the next
 * input you click into looks focused (no error, you can even Backspace/Delete) but won't accept
 * new characters, and its blinking caret never appears. Confirming in-page never triggers that.
 */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: Props): React.ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ width: 360, background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e0e0f0', marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#9090a8', lineHeight: 1.5 }}>{message}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 7, border: '1px solid #3a3a5a',
            background: 'transparent', color: '#9090a8', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            padding: '9px 16px', borderRadius: 7, border: 'none',
            background: '#e74c3c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
