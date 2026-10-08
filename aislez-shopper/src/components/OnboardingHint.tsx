import { useEffect, useState } from 'react'

const STORAGE_KEY = 'aislez-shopper-onboarded'

function markDismissed(): void {
  // Private browsing / storage disabled just means it shows again next visit — not fatal.
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
}

interface Props {
  /** Auto-dismiss once they've actually started searching — the hint's done its job. */
  dismissOn: boolean
}

/** First-time-only banner explaining the two things nothing else in the UI makes obvious: that search finds a shelf, and that the map itself can be dragged/zoomed. Gone for good after the first dismiss (button or first search), on this device. */
export default function OnboardingHint({ dismissOn }: Props): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (dismissOn) { setDismissed(true); markDismissed() }
  }, [dismissOn])

  if (dismissed) return null

  return (
    <div className="onboarding-hint">
      <span>
        <strong>Tip:</strong> search for a product above to see exactly which shelf it's on — drag to pan the map, scroll or pinch to zoom.
      </span>
      <button
        onClick={() => { setDismissed(true); markDismissed() }}
        aria-label="Dismiss"
        className="onboarding-hint-close"
      >
        ✕
      </button>
    </div>
  )
}
