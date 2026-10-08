import type { Fixture, Product } from '../types'

interface Props {
  product: Product
  fixture: Fixture | null
}

const KNOWN_KEYS = new Set(['id', 'fixtureId', 'itemName', 'price'])

/** "backroomQty" / "numeric_code" / "category" -> "Backroom Qty" / "Numeric Code" / "Category" — a retailer's own CSV column names are shown as-is otherwise (Product's catch-all field), which reads as noticeably raw next to the built-in fields. */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const PinIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

export default function ItemCard({ product, fixture }: Props): React.ReactElement {
  const extras = Object.entries(product).filter(([k, v]) => !KNOWN_KEYS.has(k) && v !== undefined && v !== '')

  return (
    <div className="item-card">
      <div className="item-card-name">{product.itemName}</div>
      {typeof product.price === 'number' && <div className="item-card-price">${product.price.toFixed(2)}</div>}
      {extras.map(([key, value]) => (
        <div key={key} className="item-card-field">{humanizeKey(key)}: {String(value)}</div>
      ))}
      {fixture ? (
        <div className="item-card-location"><PinIcon /> {fixture.locationCode ?? 'On the map'}</div>
      ) : (
        <div className="item-card-location item-card-missing"><PinIcon /> Not currently on the floor</div>
      )}
    </div>
  )
}
