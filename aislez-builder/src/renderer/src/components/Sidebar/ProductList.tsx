import React, { useState } from 'react'
import { useProductStore } from '../../store/productStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { relinkAllProducts } from '../../utils/autoLinker'
import ProductFieldSettings from './ProductFieldSettings'
import type { Product } from '../../types'

const itemBase: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3,
  padding: '8px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.06)', marginBottom: 4
}

const KNOWN_KEYS = new Set(['id', 'sku', 'itemName', 'price', 'category', 'locationCode', 'fixtureId', 'shopperVisible'])

/** Retailer-named columns kept via Product's catch-all (e.g. "Department", "Backroom Qty") */
function customFields(p: Product): [string, unknown][] {
  return Object.entries(p).filter(([k, v]) => !KNOWN_KEYS.has(k) && v !== undefined && v !== '')
}

/** Selects the product's fixture (existing selection highlight) and centers the canvas on it, so an off-screen fixture is actually visible. */
function highlightFixture(fixtureId: string): void {
  const fixture = useCanvasStore.getState().fixtures.find((f) => f.id === fixtureId)
  if (!fixture) return
  useCanvasStore.getState().selectFixture(fixtureId)
  const { pixelsPerUnit } = useProjectStore.getState()
  const { zoom, stageWidth, stageHeight, setViewport } = useUiStore.getState()
  const cx = (fixture.x + fixture.width / 2) * pixelsPerUnit
  const cy = (fixture.y + fixture.height / 2) * pixelsPerUnit
  setViewport(zoom, stageWidth / 2 - cx * zoom, stageHeight / 2 - cy * zoom)
}

export default function ProductList(): React.ReactElement {
  const products = useProductStore((s) => s.products)
  const deleteProduct = useProductStore((s) => s.deleteProduct)
  const [relinkMsg, setRelinkMsg] = useState('')
  const [showFieldSettings, setShowFieldSettings] = useState(false)

  const unlinkedCount = products.filter((p) => !p.fixtureId).length

  const handleRelink = (): void => {
    const result = relinkAllProducts()
    setRelinkMsg(
      result.unlinkedCount === 0
        ? 'All products linked.'
        : `${result.linkedCount} linked, ${result.unlinkedCount} still unlinked.`
    )
  }

  if (products.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#5a5a78', lineHeight: 1.5 }}>
          No products yet. Use File &gt; Import Products to bring in a CSV.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7a7a9a' }}>
          Products ({products.length})
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowFieldSettings(true)}
            title="Change which fields are required / shopper-visible, anytime"
            style={{
              fontSize: 10, fontWeight: 600, color: '#9090a8',
              background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3a5a',
              borderRadius: 4, padding: '3px 7px', cursor: 'pointer'
            }}
          >
            Fields
          </button>
          {unlinkedCount > 0 && (
            <button
              onClick={handleRelink}
              title="Re-check every unlinked product against fixtures placed since import"
              style={{
                fontSize: 10, fontWeight: 600, color: '#4A90D9',
                background: 'rgba(74,144,217,0.12)', border: '1px solid rgba(74,144,217,0.3)',
                borderRadius: 4, padding: '3px 7px', cursor: 'pointer'
              }}
            >
              Relink
            </button>
          )}
        </div>
      </div>
      {relinkMsg && (
        <div style={{ fontSize: 10.5, color: '#7a9a85', marginBottom: 8 }}>{relinkMsg}</div>
      )}
      {products.map((p) => {
        const extras = customFields(p)
        return (
          <div
            key={p.id}
            style={{ ...itemBase, cursor: p.fixtureId ? 'pointer' : 'default' }}
            onClick={() => p.fixtureId && highlightFixture(p.fixtureId)}
            title={p.fixtureId ? 'Click to highlight this fixture' : undefined}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#dde0e8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.itemName}>
                {p.itemName}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {p.price !== undefined && (
                  <span style={{ fontSize: 11, color: '#7a95a8' }}>${p.price.toFixed(2)}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProduct(p.id) }}
                  title="Delete this product"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#666', fontSize: 13, lineHeight: 1, padding: '0 2px'
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {p.fixtureId ? (
                <span style={{ fontSize: 10, color: '#27ae60', fontWeight: 600 }}>{p.locationCode}</span>
              ) : (
                <span style={{ fontSize: 10, color: '#e67e22', fontWeight: 600 }}>
                  ⚠ {p.locationCode ? `No fixture at ${p.locationCode}` : 'No location code'}
                </span>
              )}
              {p.category && <span style={{ fontSize: 10, color: '#5a5a78' }}>· {p.category}</span>}
            </div>
            {extras.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                {extras.map(([key, value]) => (
                  <span key={key} style={{
                    fontSize: 9.5, color: '#8a8aa0', background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3, padding: '2px 5px', whiteSpace: 'nowrap'
                  }}>
                    {key}: {String(value)}
                    {p.shopperVisible[key] && <span style={{ color: '#4A90D9' }}> · visible</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {showFieldSettings && <ProductFieldSettings onClose={() => setShowFieldSettings(false)} />}
    </div>
  )
}
