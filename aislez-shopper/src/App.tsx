import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataPackage } from './hooks/useDataPackage'
import { searchProducts } from './utils/search'
import SearchBar from './components/SearchBar'
import SearchResults from './components/SearchResults'
import ItemCard from './components/ItemCard'
import StoreMap from './components/StoreMap'
import OnboardingHint from './components/OnboardingHint'
import StartScreen from './components/StartScreen'
import type { Product } from './types'

/** Falls back to this when a data package was exported before mapBackgroundColor existed. */
const DEFAULT_MAP_BACKGROUND_COLOR = '#1a1a2e'

export default function App(): React.ReactElement {
  const { data, loading, error, loadDemo, loadFile, reset } = useDataPackage()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const resultsPanelRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => (data ? searchProducts(data.products, query) : []),
    [data, query]
  )

  useEffect(() => {
    if (selected) resultsPanelRef.current?.scrollTo({ top: 0 })
  }, [selected])

  if (!data) {
    if (loading) return <div className="status-screen">Loading store…</div>
    return <StartScreen error={error} onViewDemo={loadDemo} onUpload={loadFile} />
  }

  const selectedFixture = selected?.fixtureId
    ? data.fixtures.find((f) => f.id === selected.fixtureId) ?? null
    : null

  const handleBack = (): void => {
    reset()
    setQuery('')
    setSelected(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar-back" onClick={handleBack} type="button" aria-label="Change store">
          ← Change Store
        </button>
        <div className="topbar-brand">
          <span className="topbar-brand-icon">🛒</span>
          <span className="topbar-brand-name">{data.store.name}</span>
        </div>
        <SearchBar value={query} onChange={(v) => { setQuery(v); setSelected(null) }} />
      </header>
      <OnboardingHint dismissOn={query.length > 0} />
      <div className="body">
        <aside className="results-panel" ref={resultsPanelRef}>
          {selected && <ItemCard product={selected} fixture={selectedFixture} />}
          <SearchResults results={results} query={query} selectedId={selected?.id ?? null} onSelect={setSelected} />
        </aside>
        <main className="map-area">
          <div className="map-canvas-frame" style={{ background: data.store.mapBackgroundColor || DEFAULT_MAP_BACKGROUND_COLOR }}>
            <StoreMap data={data} highlightedFixtureId={selectedFixture?.id ?? null} />
          </div>
        </main>
      </div>
    </div>
  )
}
