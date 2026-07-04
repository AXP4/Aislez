import type { Fixture } from '../types'

export type Direction = 'up' | 'down' | 'left' | 'right'

/** All fixtures in the same chain as `anyId`, returned head→tail */
export function getChainMembers(fixtures: Fixture[], anyId: string): Fixture[] {
  const byId = new Map(fixtures.map(f => [f.id, f]))
  const start = byId.get(anyId)
  if (!start) return []

  const visited = new Set<string>()

  // Walk back to head
  let cur: Fixture = start
  while (cur.prevId && !visited.has(cur.id)) {
    visited.add(cur.id)
    const prev = byId.get(cur.prevId)
    if (!prev) break
    cur = prev
  }

  // Walk forward from head
  visited.clear()
  const members: Fixture[] = []
  while (!visited.has(cur.id)) {
    visited.add(cur.id)
    members.push(cur)
    if (!cur.nextId) break
    const next = byId.get(cur.nextId)
    if (!next) break
    cur = next
  }

  return members
}

/** Derive the screen-space direction from `from` center to `to` center */
export function deriveDirection(from: Fixture, to: Fixture): Direction {
  const dx = (to.x + to.width / 2) - (from.x + from.width / 2)
  const dy = (to.y + to.height / 2) - (from.y + from.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

/** Content-unit position of a new fixture placed edge-to-edge in `direction` from `from` */
export function getExtendPosition(from: Fixture, direction: Direction): { x: number; y: number } {
  switch (direction) {
    case 'right': return { x: from.x + from.width,  y: from.y }
    case 'left':  return { x: from.x - from.width,  y: from.y }
    case 'down':  return { x: from.x, y: from.y + from.height }
    case 'up':    return { x: from.x, y: from.y - from.height }
  }
}

/** Parse "B1-3" → { prefix: "B1", section: 3 }. Returns null if no match. */
export function parseCode(code: string): { prefix: string; section: number } | null {
  const m = code.match(/^(.*)-(\d+)$/)
  return m ? { prefix: m[1], section: parseInt(m[2], 10) } : null
}

/**
 * Find the anchor fixture ID for a chain.
 * Prefers the fixture whose code ends in -1; falls back to the chain head.
 */
export function findChainAnchorId(fixtures: Fixture[], anyId: string): string {
  const members = getChainMembers(fixtures, anyId)
  const root = members.find(f => f.locationCode ? parseCode(f.locationCode)?.section === 1 : false)
  if (root) return root.id
  const head = members.find(f => !f.prevId)
  return head?.id ?? anyId
}

/**
 * Renumber coded fixtures along a chain starting from `headId` through nextId links.
 * Uses the head's code prefix. Assigns section 1, 2, 3… to each fixture that has a code.
 * Fixtures without a code are skipped (gap in numbering).
 */
export function renumberChainFrom(fixtures: Fixture[], headId: string, startSection = 1): Fixture[] {
  const byId = new Map(fixtures.map(f => [f.id, f]))
  const head = byId.get(headId)
  if (!head?.locationCode) return fixtures

  const parsed = parseCode(head.locationCode)
  if (!parsed) return fixtures

  const updates = new Map<string, string>()
  let cur: Fixture | undefined = head
  let section = startSection

  while (cur) {
    if (cur.locationCode !== undefined) {
      updates.set(cur.id, `${parsed.prefix}-${section}`)
      section++
    }
    cur = cur.nextId ? byId.get(cur.nextId) : undefined
  }

  return fixtures.map(f => updates.has(f.id) ? { ...f, locationCode: updates.get(f.id) } : f)
}
