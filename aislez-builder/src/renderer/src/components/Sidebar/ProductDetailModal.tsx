import React, { useState } from 'react'
import { useProductStore } from '../../store/productStore'
import { relinkAllProducts } from '../../utils/autoLinker'
import type { Product } from '../../types'

const KNOWN_KEYS = new Set(['id', 'sku', 'itemName', 'price', 'category', 'locationCode', 'fixtureId', 'shopperVisible'])

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#9090a8',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#12121f',
  border: '1px solid #3a3a5a', borderRadius: 6, color: '#e0e0f0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box'
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      {children}
    </div>
  )
}

interface Props {
  product: Product
  onClose: () => void
}

export default function ProductDetailModal({ product, onClose }: Props): React.ReactElement {
  const updateProduct = useProductStore((s) => s.updateProduct)
  const deleteProduct = useProductStore((s) => s.deleteProduct)

  const [itemName, setItemName] = useState(product.itemName)
  const [sku, setSku] = useState(product.sku ?? '')
  const [price, setPrice] = useState(product.price !== undefined ? String(product.price) : '')
  const [category, setCategory] = useState(product.category ?? '')
  const [locationCode, setLocationCode] = useState(product.locationCode ?? '')
  const [customEntries, setCustomEntries] = useState<[string, string][]>(
    Object.entries(product)
      .filter(([k, v]) => !KNOWN_KEYS.has(k) && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  )
  const [error, setError] = useState('')

  const updateCustomEntry = (index: number, key: string, value: string): void => {
    setCustomEntries((entries) => entries.map((e, i) => (i === index ? [key, value] : e)))
  }
  const removeCustomEntry = (index: number): void => {
    setCustomEntries((entries) => entries.filter((_, i) => i !== index))
  }
  const addCustomEntry = (): void => setCustomEntries((entries) => [...entries, ['', '']])

  const handleSave = (): void => {
    if (!itemName.trim()) { setError('Item Name is required.'); return }

    const duplicateKey = customEntries.find(([k], i) =>
      k.trim() && customEntries.findIndex(([k2]) => k2.trim() === k.trim()) !== i
    )
    if (duplicateKey) { setError(`"${duplicateKey[0]}" is used by more than one field.`); return }

    const fields: Record<string, unknown> = {
      itemName: itemName.trim(),
      sku: sku.trim() || undefined,
      price: price.trim() === '' ? undefined : (isNaN(parseFloat(price)) ? undefined : parseFloat(price)),
      category: category.trim() || undefined,
      locationCode: locationCode.trim() || undefined
    }
    for (const [key, value] of customEntries) {
      if (key.trim()) fields[key.trim()] = value
    }

    updateProduct(product.id, fields)
    relinkAllProducts()
    onClose()
  }

  const handleDelete = (): void => {
    deleteProduct(product.id)
    onClose()
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}
    >
      <div style={{
        width: 440, maxHeight: '85vh', overflowY: 'auto',
        background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 12,
        padding: 32, display: 'flex', flexDirection: 'column', gap: 16
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0' }}>Edit Product</div>

        <Field label="Item Name">
          <input style={INPUT} value={itemName} onChange={(e) => setItemName(e.target.value)} autoFocus />
        </Field>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="SKU">
              <input style={INPUT} value={sku} onChange={(e) => setSku(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Price">
              <input style={INPUT} type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Category">
              <input style={INPUT} value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Location Code">
              <input style={INPUT} value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="e.g. B3-1" />
            </Field>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={LABEL}>Custom Fields</div>
            <button onClick={addCustomEntry} style={{
              fontSize: 10, fontWeight: 600, color: '#4A90D9', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0
            }}>
              + Add Field
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customEntries.map(([key, value], i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  style={{ ...INPUT, flex: 1 }}
                  placeholder="Field name"
                  value={key}
                  onChange={(e) => updateCustomEntry(i, e.target.value, value)}
                />
                <input
                  style={{ ...INPUT, flex: 1 }}
                  placeholder="Value"
                  value={value}
                  onChange={(e) => updateCustomEntry(i, key, e.target.value)}
                />
                <button
                  onClick={() => removeCustomEntry(i)}
                  title="Remove field"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 15, padding: '0 4px' }}
                >
                  ×
                </button>
              </div>
            ))}
            {customEntries.length === 0 && (
              <div style={{ fontSize: 11.5, color: '#5a5a78' }}>No custom fields on this product.</div>
            )}
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#e74c3c' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <button onClick={handleDelete} style={{
            padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(231,76,60,0.4)',
            background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>
            Delete Product
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              padding: '9px 16px', borderRadius: 6, border: '1px solid #3a3a5a',
              background: 'transparent', color: '#9090a8', fontSize: 13, cursor: 'pointer'
            }}>
              Cancel
            </button>
            <button onClick={handleSave} style={{
              padding: '9px 18px', borderRadius: 6, border: 'none',
              background: '#4A90D9', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
