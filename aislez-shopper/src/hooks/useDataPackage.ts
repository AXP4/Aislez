import { useCallback, useState } from 'react'
import type { DataPackage } from '../types'

interface State {
  data: DataPackage | null
  loading: boolean
  error: string | null
}

function isDataPackage(value: unknown): value is DataPackage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.store === 'object' && v.store !== null &&
    Array.isArray(v.fixtures) &&
    Array.isArray(v.products)
  )
}

/** Starts with no store loaded — the start screen decides whether that's the bundled demo or an uploaded export. */
export function useDataPackage(): State & { loadDemo: () => void; loadFile: (file: File) => void; reset: () => void } {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null })

  const reset = useCallback(() => setState({ data: null, loading: false, error: null }), [])

  const loadDemo = useCallback(() => {
    setState({ data: null, loading: true, error: null })
    fetch(`${import.meta.env.BASE_URL}datapackage.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: DataPackage) => setState({ data, loading: false, error: null }))
      .catch((err: Error) => setState({ data: null, loading: false, error: err.message }))
  }, [])

  const loadFile = useCallback((file: File) => {
    setState({ data: null, loading: true, error: null })
    file.text()
      .then((text) => {
        const parsed = JSON.parse(text)
        if (!isDataPackage(parsed)) throw new Error('Not a valid Aislez store export.')
        setState({ data: parsed, loading: false, error: null })
      })
      .catch(() => setState({ data: null, loading: false, error: "Couldn't read that file — make sure it's a datapackage.json exported from Aislez Builder." }))
  }, [])

  return { ...state, loadDemo, loadFile, reset }
}
