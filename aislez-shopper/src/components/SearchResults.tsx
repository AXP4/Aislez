import type { Product } from '../types'

interface Props {
  results: Product[]
  query: string
  selectedId: string | null
  onSelect: (product: Product) => void
}

export default function SearchResults({ results, query, selectedId, onSelect }: Props): React.ReactElement | null {
  if (!query.trim()) {
    return (
      <div className="results-panel-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <div>Start typing to find a product and see where it is in the store.</div>
      </div>
    )
  }

  if (results.length === 0) {
    return <div className="results-panel-empty">No products match "{query}".</div>
  }

  return (
    <div>
      <div className="results-count">{results.length} result{results.length === 1 ? '' : 's'}</div>
      <ul className="search-results">
        {results.map((p) => (
          <li key={p.id}>
            <button
              className={p.id === selectedId ? 'result-item selected' : 'result-item'}
              onClick={() => onSelect(p)}
            >
              <span className="result-name">{p.itemName}</span>
              {typeof p.price === 'number' && <span className="result-price">${p.price.toFixed(2)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
