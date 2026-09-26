import React, { useState, useRef } from 'react'
import { parseCsv } from '../../utils/csvParser'
import { linkProductsToFixtures } from '../../utils/autoLinker'
import { useProductStore } from '../../store/productStore'
import { useCanvasStore } from '../../store/canvasStore'
import ColumnMapper from './ColumnMapper'
import ImportSummary from './ImportSummary'
import type { ColumnMap, ShopperVisibility, Product } from '../../types'

let _productCounter = 0
function generateProductId(): string {
  return `product_${Date.now()}_${++_productCounter}`
}

type Step = 'upload' | 'map' | 'summary'

interface Summary {
  totalImported: number
  linkedCount: number
  unlinkedCount: number
  skippedCount: number
}

interface Props { onClose: () => void }

export default function CSVImporter({ onClose }: Props): React.ReactElement {
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const parsed = parseCsv(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("That file doesn't look like a valid CSV — no rows found.")
        return
      }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
    }
    reader.onerror = () => setError("Couldn't read that file.")
    reader.readAsText(file)
  }

  const handleMapConfirm = (columnMap: ColumnMap, shopperVisible: ShopperVisibility, requiredFields: string[]): void => {
    const products: Product[] = []
    let skippedCount = 0

    for (const row of rows) {
      const product: Partial<Product> = { id: generateProductId(), shopperVisible: { ...shopperVisible } }
      for (const [header, fieldName] of Object.entries(columnMap)) {
        if (!fieldName) continue
        const raw = row[header] ?? ''
        if (fieldName === 'price') {
          const num = parseFloat(raw)
          product.price = isNaN(num) ? undefined : num
        } else {
          product[fieldName] = raw || undefined
        }
      }
      // Any field the retailer marked Required (Item Name always among them) must
      // have a value, or the row isn't a usable item — skip it rather than
      // importing a product with a blank identifier/name.
      const missingRequired = requiredFields.some((f) => !product[f])
      if (missingRequired) { skippedCount++; continue }
      products.push(product as Product)
    }

    const { fixtures } = useCanvasStore.getState()
    const { products: linked, linkedCount, unlinkedCount } = linkProductsToFixtures(products, fixtures)
    useProductStore.getState().importProducts(linked, columnMap)
    setSummary({ totalImported: linked.length, linkedCount, unlinkedCount, skippedCount })
    setStep('summary')
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
        width: 520, maxHeight: '85vh', overflowY: 'auto',
        background: '#1a1a2e', border: '1px solid #2e2e4a', borderRadius: 12,
        padding: 32, display: 'flex', flexDirection: 'column', gap: 22
      }}>
        {step === 'upload' && (
          <>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>Import Products</div>
              <div style={{ fontSize: 13, color: '#5a5a78' }}>Upload a CSV of your products to link them to fixtures.</div>
            </div>

            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '28px 16px', borderRadius: 8, border: '1px dashed #3a3a5a',
                background: 'rgba(255,255,255,0.03)', color: '#9090a8', fontSize: 13,
                cursor: 'pointer', textAlign: 'center'
              }}
            >
              {fileName ? `Selected: ${fileName} (${rows.length} rows)` : 'Click to choose a .csv file'}
            </button>

            {error && <div style={{ fontSize: 12, color: '#e74c3c' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={onClose} style={{
                padding: '9px 16px', borderRadius: 6, border: '1px solid #3a3a5a',
                background: 'transparent', color: '#9090a8', fontSize: 13, cursor: 'pointer'
              }}>
                Cancel
              </button>
              <button
                onClick={() => setStep('map')}
                disabled={rows.length === 0}
                style={{
                  padding: '9px 16px', borderRadius: 6, border: 'none',
                  background: rows.length > 0 ? '#4A90D9' : '#2a3a4a',
                  color: rows.length > 0 ? '#fff' : '#5a6a78',
                  fontSize: 13, fontWeight: 600, cursor: rows.length > 0 ? 'pointer' : 'default'
                }}
              >
                Next: Map Columns
              </button>
            </div>
          </>
        )}

        {step === 'map' && (
          <ColumnMapper
            headers={headers}
            previewRows={rows}
            onBack={() => setStep('upload')}
            onConfirm={handleMapConfirm}
          />
        )}

        {step === 'summary' && summary && (
          <ImportSummary
            totalImported={summary.totalImported}
            linkedCount={summary.linkedCount}
            unlinkedCount={summary.unlinkedCount}
            skippedCount={summary.skippedCount}
            onDone={onClose}
          />
        )}
      </div>
    </div>
  )
}
