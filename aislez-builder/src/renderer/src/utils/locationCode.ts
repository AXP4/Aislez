import type { Fixture, Unit } from '../types'

const AISLE_WIDTH_M = 3    // meters per aisle zone (~width of a retail aisle)
const BAY_HEIGHT_M  = 1.5  // meters per bay zone

function getZoneWidths(unit: Unit): { aisleWidth: number; bayHeight: number } {
  if (unit === 'feet') {
    return { aisleWidth: AISLE_WIDTH_M * 3.28084, bayHeight: BAY_HEIGHT_M * 3.28084 }
  }
  return { aisleWidth: AISLE_WIDTH_M, bayHeight: BAY_HEIGHT_M }
}

function aisleLetterFromX(x: number, aisleWidth: number): string {
  const index = Math.floor(x / aisleWidth)
  if (index < 26) return String.fromCharCode(65 + index)
  // Two-letter fallback for very wide stores (>26 aisles)
  const first  = String.fromCharCode(65 + Math.floor(index / 26) - 1)
  const second = String.fromCharCode(65 + (index % 26))
  return first + second
}

function bayNumberFromY(y: number, bayHeight: number): number {
  return Math.floor(y / bayHeight) + 1  // 1-based
}

/**
 * Generates a unique location code for a new fixture at (x, y).
 * Pass the current fixture list (before adding the new one) to avoid collisions.
 */
export function generateLocationCode(x: number, y: number, existing: Fixture[], unit: Unit): string {
  const { aisleWidth, bayHeight } = getZoneWidths(unit)
  const aisle  = aisleLetterFromX(x, aisleWidth)
  const bay    = bayNumberFromY(y, bayHeight)
  const prefix = `${aisle}${bay}-`

  const used = new Set(existing.map((f) => f.locationCode).filter(Boolean))

  let section = 1
  while (used.has(`${prefix}${section}`)) section++

  return `${prefix}${section}`
}

/**
 * Recomputes location codes for all fixtures based on their current positions.
 * Sorts by aisle→bay order and assigns sections 1, 2, 3… within each bucket.
 * Returns a Map<fixtureId, newLocationCode>.
 */
export function recomputeAllLocationCodes(fixtures: Fixture[], unit: Unit): Map<string, string> {
  const { aisleWidth, bayHeight } = getZoneWidths(unit)

  const sorted = [...fixtures].sort((a, b) => {
    const ai = Math.floor(a.x / aisleWidth)
    const bi = Math.floor(b.x / aisleWidth)
    if (ai !== bi) return ai - bi
    return Math.floor(a.y / bayHeight) - Math.floor(b.y / bayHeight)
  })

  const result  = new Map<string, string>()
  const counter = new Map<string, number>()

  for (const f of sorted) {
    const prefix = `${aisleLetterFromX(f.x, aisleWidth)}${bayNumberFromY(f.y, bayHeight)}-`
    const n = (counter.get(prefix) ?? 0) + 1
    counter.set(prefix, n)
    result.set(f.id, `${prefix}${n}`)
  }

  return result
}
