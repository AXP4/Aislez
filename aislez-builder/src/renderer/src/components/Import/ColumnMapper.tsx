import React, { useState } from 'react'
import type { ColumnKey, ColumnMap, ShopperVisibility } from '../../types'

const FIELD_LABELS: Record<ColumnKey, string> = {
  itemName: 'Item Name',
  sku: 'SKU',
  price: 'Price',
  category: 'Category',
  locationCode: 'Location Code'
}

const DEFAULT_SHOPPER_VISIBLE: Record<ColumnKey, boolean> = {
  itemName: true, price: true, category: true, sku: false, locationCode: false
}

const GUESS: [ColumnKey, RegExp][] = [
  ['sku', /sku|item.?num|product.?id|upc/i],
  ['itemName', /item.?name|product.?name|^description$|^desc$/i],
  ['price', /price|cost/i],
  ['category', /categ|dept|department/i],
  ['locationCode', /location|loc.?code|aisle|bay/i]
]

function guessTarget(header: string): ColumnKey | '' {
  for (const [key, pattern] of GUESS) {
    if (pattern.test(header)) return key
  }
  return ''
}

interface FieldConfig {
  /** '' = don't import, a ColumnKey = standard field, 'custom' = retailer-named field */
  target: ColumnKey | 'custom' | ''
  customName: string
  required: boolean
  shopperVisible: boolean
}

function finalFieldName(cfg: FieldConfig): string {
  return cfg.target === 'custom' ? cfg.customName.trim() : cfg.target
}

const SELECT: React.CSSProperties = {
  width: '100%', padding: '6px 8px', background: '#12121f',
  border: '1px solid #3a3a5a', borderRadius: 5, color: '#e0e0f0',
  fontSize: 12, outline: 'none'
}

const CHECK_LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#9090a8', whiteSpace: 'nowrap'
}

interface Props {
  headers: string[]
  previewRows: Record<string, string>[]
  onBack: () => void
  onConfirm: (columnMap: ColumnMap, shopperVisible: ShopperVisibility, requiredFields: string[]) => void
}

export default function ColumnMapper({ headers, previewRows, onBack, onConfirm }: Props): React.ReactElement {
  const [mapping, setMapping] = useState<Record<string, FieldConfig>>(() => {
    const initial: Record<string, FieldConfig> = {}
    const used = new Set<ColumnKey>()
    for (const h of headers) {
      const guess = guessTarget(h)
      const target = guess && !used.has(guess) ? guess : ''
      if (target) used.add(target)
      initial[h] = {
        target,
        customName: '',
        required: target === 'itemName',
        shopperVisible: target ? DEFAULT_SHOPPER_VISIBLE[target] : false
      }
    }
    return initial
  })

  const usedStandardKeys = new Set(
    Object.values(mapping).map((c) => c.target).filter((t): t is ColumnKey => !!t && t !== 'custom')
  )

  const activeFieldNames = Object.values(mapping)
    .filter((c) => c.target)
    .map(finalFieldName)
    .filter(Boolean)
  const duplicateNames = new Set(activeFieldNames.filter((n, i) => activeFieldNames.indexOf(n) !== i))
  const itemNameMapped = Object.values(mapping).some((c) => c.target === 'itemName')
  const emptyCustomNames = Object.values(mapping).some((c) => c.target === 'custom' && !c.customName.trim())
  const canImport = itemNameMapped && duplicateNames.size === 0 && !emptyCustomNames

  const updateField = (header: string, updates: Partial<FieldConfig>): void => {
    setMapping((m) => ({ ...m, [header]: { ...m[header], ...updates } }))
  }

  const handleTargetChange = (header: string, value: string): void => {
    const target = value as FieldConfig['target']
    updateField(header, {
      target,
      required: target === 'itemName',
      shopperVisible: target && target !== 'custom' ? DEFAULT_SHOPPER_VISIBLE[target] : false
    })
  }

  const handleConfirm = (): void => {
    if (!canImport) return
    const columnMap: ColumnMap = {}
    const shopperVisible: ShopperVisibility = {}
    const requiredFields: string[] = []
    for (const [header, cfg] of Object.entries(mapping)) {
      if (!cfg.target) continue
      const fieldName = finalFieldName(cfg)
      if (!fieldName) continue
      columnMap[header] = fieldName
      shopperVisible[fieldName] = cfg.shopperVisible
      if (cfg.required) requiredFields.push(fieldName)
    }
    onConfirm(columnMap, shopperVisible, requiredFields)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>Map Columns</div>
        <div style={{ fontSize: 13, color: '#5a5a78' }}>
          For each column: what is it, does every item need it, and can shoppers see it? Item Name is always required.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
        {headers.map((header) => {
          const cfg = mapping[header]
          const fieldName = finalFieldName(cfg)
          const isDuplicate = !!fieldName && duplicateNames.has(fieldName)
          return (
            <div key={header} style={{
              display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px',
              borderRadius: 6, background: 'rgba(255,255,255,0.04)',
              border: isDuplicate ? '1px solid #e74c3c' : '1px solid transparent'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#dde0e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={header}>
                  {header}
                </div>
                <select style={SELECT} value={cfg.target} onChange={(e) => handleTargetChange(header, e.target.value)}>
                  <option value="">Don't import</option>
                  {(Object.keys(FIELD_LABELS) as ColumnKey[]).map((key) => (
                    <option key={key} value={key} disabled={usedStandardKeys.has(key) && cfg.target !== key}>
                      {FIELD_LABELS[key]}
                    </option>
                  ))}
                  <option value="custom">Custom field…</option>
                </select>
              </div>

              {cfg.target === 'custom' && (
                <input
                  value={cfg.customName}
                  onChange={(e) => updateField(header, { customName: e.target.value })}
                  placeholder="Field name (e.g. Department, Backroom Qty)"
                  style={{ ...SELECT, fontSize: 12 }}
                />
              )}

              {cfg.target && (
                <div style={{ display: 'flex', gap: 14 }}>
                  <label style={CHECK_LABEL}>
                    <input
                      type="checkbox"
                      checked={cfg.required}
                      disabled={cfg.target === 'itemName'}
                      onChange={(e) => updateField(header, { required: e.target.checked })}
                    />
                    Required{cfg.target === 'itemName' ? ' (always)' : ''}
                  </label>
                  <label style={CHECK_LABEL}>
                    <input
                      type="checkbox"
                      checked={cfg.shopperVisible}
                      onChange={(e) => updateField(header, { shopperVisible: e.target.checked })}
                    />
                    Shopper-visible
                  </label>
                </div>
              )}

              {isDuplicate && (
                <div style={{ fontSize: 11, color: '#e74c3c' }}>
                  "{fieldName}" is already used by another column — give it a different name.
                </div>
              )}
            </div>
          )
        })}
      </div>

      {previewRows.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7a7a9a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Preview
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #2e2e4a', borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#7a7a9a', borderBottom: '1px solid #2e2e4a', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {headers.map((h) => (
                      <td key={h} style={{ padding: '6px 8px', color: '#c0c0d8', whiteSpace: 'nowrap' }}>{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!itemNameMapped && (
        <div style={{ fontSize: 12, color: '#e67e22' }}>Map a column to Item Name to continue.</div>
      )}
      {emptyCustomNames && (
        <div style={{ fontSize: 12, color: '#e67e22' }}>Give every custom field a name, or set it back to "Don't import".</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onBack} style={{
          padding: '9px 16px', borderRadius: 6, border: '1px solid #3a3a5a',
          background: 'transparent', color: '#9090a8', fontSize: 13, cursor: 'pointer'
        }}>
          Back
        </button>
        <button onClick={handleConfirm} disabled={!canImport} style={{
          padding: '9px 16px', borderRadius: 6, border: 'none',
          background: canImport ? '#4A90D9' : '#2a3a4a',
          color: canImport ? '#fff' : '#5a6a78',
          fontSize: 13, fontWeight: 600, cursor: canImport ? 'pointer' : 'default'
        }}>
          Import
        </button>
      </div>
    </div>
  )
}
