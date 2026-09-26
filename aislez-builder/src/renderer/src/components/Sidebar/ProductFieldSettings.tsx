import React from 'react'
import { useProductStore } from '../../store/productStore'

const INTERNAL_KEYS = new Set(['id', 'fixtureId', 'shopperVisible'])

const FIELD_LABELS: Record<string, string> = {
  itemName: 'Item Name', sku: 'SKU', price: 'Price', category: 'Category', locationCode: 'Location Code'
}

const CHECK_LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#9090a8', whiteSpace: 'nowrap'
}

interface Props { onClose: () => void }

export default function ProductFieldSettings({ onClose }: Props): React.ReactElement {
  const products = useProductStore((s) => s.products)
  const requiredFields = useProductStore((s) => s.requiredFields)
  const setFieldVisibility = useProductStore((s) => s.setFieldVisibility)
  const setFieldRequired = useProductStore((s) => s.setFieldRequired)

  const fields = Array.from(
    new Set(products.flatMap((p) => Object.keys(p).filter((k) => !INTERNAL_KEYS.has(k))))
  )

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}
    >
      <div style={{
        width: 460, maxHeight: '82vh', overflowY: 'auto',
        background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 12,
        padding: 32, display: 'flex', flexDirection: 'column', gap: 18
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>Product Fields</div>
          <div style={{ fontSize: 13, color: '#5a5a78' }}>
            The same settings from import, editable anytime. Item Name always stays required.
          </div>
        </div>

        {fields.length === 0 ? (
          <div style={{ fontSize: 12, color: '#5a5a78' }}>No products imported yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fields.map((field) => {
              const visible = products.some((p) => p[field] !== undefined && p.shopperVisible[field])
              const required = requiredFields.includes(field)
              const missingCount = required
                ? products.filter((p) => p[field] === undefined || p[field] === '').length
                : 0
              const isItemName = field === 'itemName'
              return (
                <div key={field} style={{
                  display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px',
                  borderRadius: 6, background: 'rgba(255,255,255,0.04)'
                }}>
                  <div style={{ fontSize: 13, color: '#dde0e8', fontWeight: 600 }}>
                    {FIELD_LABELS[field] ?? field}
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <label style={CHECK_LABEL}>
                      <input
                        type="checkbox"
                        checked={isItemName || required}
                        disabled={isItemName}
                        onChange={(e) => setFieldRequired(field, e.target.checked)}
                      />
                      Required{isItemName ? ' (always)' : ''}
                    </label>
                    <label style={CHECK_LABEL}>
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) => setFieldVisibility(field, e.target.checked)}
                      />
                      Shopper-visible
                    </label>
                  </div>
                  {missingCount > 0 && (
                    <div style={{ fontSize: 11, color: '#e67e22' }}>
                      ⚠ {missingCount} existing product{missingCount === 1 ? '' : 's'} missing this — not removed automatically.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 6, border: 'none',
            background: '#4A90D9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
