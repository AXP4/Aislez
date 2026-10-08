import { useRef } from 'react'

interface Props {
  error: string | null
  onViewDemo: () => void
  onUpload: (file: File) => void
}

export default function StartScreen({ error, onViewDemo, onUpload }: Props): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="start-screen">
      <div className="start-screen-icon">🛒</div>
      <h1 className="start-screen-title">Aislez</h1>
      <p className="start-screen-subtitle">Find any product's exact spot on the store map.</p>
      {error && <p className="start-screen-error">{error}</p>}
      <div className="start-screen-actions">
        <button className="start-screen-button primary" onClick={onViewDemo} type="button">
          View Demo Store
        </button>
        <button className="start-screen-button" onClick={() => fileInputRef.current?.click()} type="button">
          Upload a Store File
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
