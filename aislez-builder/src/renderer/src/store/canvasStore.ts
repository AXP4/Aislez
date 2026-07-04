import { create } from 'zustand'
import type { Fixture, FixtureType, Unit } from '../types'
import type { Direction } from '../utils/chain'
import {
  getChainMembers, getExtendPosition, parseCode,
  findChainAnchorId
} from '../utils/chain'

export interface FixtureDefaults {
  width: number
  height: number
}

const DEFAULTS_M: Record<FixtureType, FixtureDefaults> = {
  shelf:    { width: 1.2, height: 0.5 },
  chiller:  { width: 1.0, height: 0.8 },
  bunker:   { width: 1.2, height: 1.0 },
  endcap:   { width: 0.6, height: 1.0 },
  sidekick: { width: 0.3, height: 0.6 },
  pallet:   { width: 1.0, height: 1.2 },
  rack:     { width: 0.6, height: 0.4 },
  table:    { width: 1.2, height: 0.6 },
  bin:      { width: 0.6, height: 0.6 }
}

const DEFAULTS_FT: Record<FixtureType, FixtureDefaults> = {
  shelf:    { width: 4.0, height: 1.5 },
  chiller:  { width: 3.5, height: 2.5 },
  bunker:   { width: 4.0, height: 3.5 },
  endcap:   { width: 2.0, height: 3.5 },
  sidekick: { width: 1.0, height: 2.0 },
  pallet:   { width: 3.5, height: 4.0 },
  rack:     { width: 2.0, height: 1.5 },
  table:    { width: 4.0, height: 2.0 },
  bin:      { width: 2.0, height: 2.0 }
}

export const FIXTURE_DEFAULTS_BY_UNIT: Record<Unit, Record<FixtureType, FixtureDefaults>> = {
  meters: DEFAULTS_M,
  feet:   DEFAULTS_FT
}

let _counter = 0
function generateId(): string {
  return `fixture_${Date.now()}_${++_counter}`
}

const MAX_HISTORY = 50

function withHistory(state: CanvasStore): Pick<CanvasStore, 'past' | 'future'> {
  return {
    past:   [...state.past.slice(-(MAX_HISTORY - 1)), state.fixtures],
    future: []
  }
}

interface CanvasStore {
  fixtures: Fixture[]
  selectedFixtureId:   string | null
  /** ID of the chain's -1 fixture when a chain is selected as a group */
  selectedChainAnchor: string | null
  /** IDs of fixtures in an active multi-selection (rubber band or Ctrl+click) */
  multiSelectedIds:    string[]

  past:   Fixture[][]
  future: Fixture[][]
  undo: () => void
  redo: () => void

  addFixture:     (type: FixtureType, x: number, y: number, width: number, height: number) => void
  moveFixture:    (id: string, x: number, y: number) => void
  /** Move all fixtures in `ids` by the same delta — used for chain-group drag */
  moveChain:      (ids: string[], dx: number, dy: number) => void
  deleteFixture:  (id: string) => void
  /** Remove all fixtures in `ids` (whole chain) in a single undo step */
  deleteChain:    (ids: string[]) => void
  rotateFixture:  (id: string) => void
  /** Rotate every fixture in `ids` 90° (swap width/height) in a single undo step */
  rotateChain:    (ids: string[]) => void
  setFixtureCode: (id: string, code: string | undefined) => void
  /** Extend the chain from `fromId` (must be a tail) in `direction` */
  extendChain:    (fromId: string, direction: Direction) => void
  /** Drag a fixture out of its chain beyond the 0.5-unit threshold */
  detachAndMove:  (id: string, newX: number, newY: number) => void
  /** Reconnect a standalone fixture to an open chain end, also moving it to newX/newY */
  rejoinChain:    (id: string, neighborId: string, side: 'before' | 'after', x: number, y: number) => void
  /** Fill a gap: connect prevNeighbor → id → nextNeighbor in one step */
  rejoinBoth:     (id: string, prevNeighborId: string, nextNeighborId: string, x: number, y: number) => void
  /** Link the open tail of one chain to the open head of another */
  linkChains:     (tailId: string, headId: string) => void

  /** Duplicate the selected fixture or chain, offset by dx/dy (one grid snap unit) */
  duplicateSelected: (dx: number, dy: number) => void

  /** Replace the entire multi-selection with these IDs (clears single/chain selection) */
  setMultiSelected:   (ids: string[]) => void
  /** Add or remove a single fixture from the multi-selection */
  toggleMultiSelect:  (id: string) => void
  /** Union ids into the current multi-selection (does not replace) */
  addToMultiSelected: (ids: string[]) => void
  /** Move all fixtures in ids by the same delta (multi-select drag) */
  moveMulti:          (ids: string[], dx: number, dy: number) => void
  /** Delete all fixtures in ids, repairing any broken chain links */
  deleteMulti:        (ids: string[]) => void
  /** Rotate all fixtures in ids 90° clockwise around their collective bounding-box centre */
  rotateMulti:        (ids: string[]) => void

  selectFixture: (id: string) => void
  selectChain:   (id: string) => void
  deselectAll:   () => void

  scaleAllFixtures: (factor: number) => void
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  fixtures: [],
  selectedFixtureId:   null,
  selectedChainAnchor: null,
  multiSelectedIds:    [],
  past:   [],
  future: [],

  undo: () => set((s) => {
    if (s.past.length === 0) return s
    const prev = s.past[s.past.length - 1]
    return {
      fixtures: prev,
      past:     s.past.slice(0, -1),
      future:   [s.fixtures, ...s.future],
      selectedFixtureId: null,
      selectedChainAnchor: null,
      multiSelectedIds: []
    }
  }),

  redo: () => set((s) => {
    if (s.future.length === 0) return s
    const next = s.future[0]
    return {
      fixtures: next,
      past:     [...s.past, s.fixtures],
      future:   s.future.slice(1),
      selectedFixtureId: null,
      selectedChainAnchor: null,
      multiSelectedIds: []
    }
  }),

  // Fixtures drop unlabeled with no chain links
  addFixture: (type, x, y, width, height) => set((s) => ({
    ...withHistory(s),
    fixtures: [...s.fixtures, {
      id: generateId(), type, x, y, width, height, rotation: 0,
      label: type.charAt(0).toUpperCase() + type.slice(1)
    }]
  })),

  moveFixture: (id, x, y) => set((s) => ({
    ...withHistory(s),
    fixtures: s.fixtures.map((f) => f.id === id ? { ...f, x, y } : f)
  })),

  moveChain: (ids, dx, dy) => set((s) => ({
    ...withHistory(s),
    fixtures: s.fixtures.map((f) =>
      ids.includes(f.id)
        ? { ...f, x: Math.round((f.x + dx) * 100) / 100, y: Math.round((f.y + dy) * 100) / 100 }
        : f
    )
  })),

  deleteFixture: (id) => set((s) => {
    const fixture = s.fixtures.find(f => f.id === id)
    if (!fixture) return s

    // Remove fixture and repair chain links — codes are physical locations so no renumbering
    let fixtures = s.fixtures.filter(f => f.id !== id)

    if (fixture.prevId && fixture.nextId) {
      // Middle deleted: split into two chains — do not bridge (fixtures are no longer adjacent)
      fixtures = fixtures.map(f => {
        if (f.id === fixture.prevId) return { ...f, nextId: undefined }  // prev becomes tail
        if (f.id === fixture.nextId) return { ...f, prevId: undefined }  // next becomes head
        return f
      })
    } else if (fixture.prevId) {
      fixtures = fixtures.map(f => f.id === fixture.prevId ? { ...f, nextId: undefined } : f)
    } else if (fixture.nextId) {
      fixtures = fixtures.map(f => f.id === fixture.nextId ? { ...f, prevId: undefined } : f)
    }

    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   s.selectedFixtureId === id ? null : s.selectedFixtureId,
      selectedChainAnchor: null
    }
  }),

  deleteChain: (ids) => set((s) => ({
    ...withHistory(s),
    fixtures: s.fixtures.filter(f => !ids.includes(f.id)),
    selectedFixtureId: null,
    selectedChainAnchor: null
  })),

  // Rotation swaps width/height; position and code unchanged
  rotateFixture: (id) => set((s) => ({
    ...withHistory(s),
    fixtures: s.fixtures.map((f) =>
      f.id === id ? { ...f, width: f.height, height: f.width } : f
    )
  })),

  rotateChain: (ids) => set((s) => {
    if (ids.length === 0) return s

    // ids are in chain order (head first, from getChainMembers)
    const chain = ids.map(id => s.fixtures.find(f => f.id === id)).filter((f): f is Fixture => !!f)
    if (chain.length === 0) return s

    const head   = chain[0]
    const second = chain[1]

    // Determine current direction from head→second positions
    const isHorizontal = !second || Math.abs(second.x - head.x) >= Math.abs(second.y - head.y)

    // Rotate swaps width/height; direction also flips (horiz→vert, vert→horiz)
    let offset = 0
    const updates = new Map<string, Partial<Fixture>>()
    for (const f of chain) {
      const newW = f.height
      const newH = f.width
      // If was horizontal → now vertical (stack downward from head)
      const newX = isHorizontal ? head.x : head.x + offset
      const newY = isHorizontal ? head.y + offset : head.y
      updates.set(f.id, { width: newW, height: newH, x: newX, y: newY })
      offset += isHorizontal ? newH : newW
    }

    return {
      ...withHistory(s),
      fixtures: s.fixtures.map(f => {
        const u = updates.get(f.id)
        return u ? { ...f, ...u } : f
      })
    }
  }),

  setFixtureCode: (id, code) => set((s) => {
    if (!code) {
      return {
        ...withHistory(s),
        fixtures: s.fixtures.map(f => f.id === id ? { ...f, locationCode: undefined } : f)
      }
    }

    const fixture = s.fixtures.find(f => f.id === id)
    if (!fixture) return s
    const parsed = parseCode(code)

    // Middle or tail (has prevId) — or code not parseable: assign only to this fixture
    if (fixture.prevId || !fixture.nextId || !parsed) {
      return {
        ...withHistory(s),
        fixtures: s.fixtures.map(f => f.id === id ? { ...f, locationCode: code } : f)
      }
    }

    // Chain head (no prevId, has nextId): propagate through nextId links
    const updates = new Map<string, string>()
    const byId = new Map(s.fixtures.map(f => [f.id, f]))
    let cur: Fixture | undefined = fixture
    let section = parsed.section
    while (cur) {
      updates.set(cur.id, `${parsed.prefix}-${section++}`)
      cur = cur.nextId ? byId.get(cur.nextId) : undefined
    }

    return {
      ...withHistory(s),
      fixtures: s.fixtures.map(f => updates.has(f.id) ? { ...f, locationCode: updates.get(f.id) } : f)
    }
  }),

  extendChain: (fromId, direction) => set((s) => {
    const from = s.fixtures.find(f => f.id === fromId)
    if (!from || from.nextId) return s

    const pos = getExtendPosition(from, direction)

    // Block if the new fixture would overlap any existing fixture
    const wouldOverlap = s.fixtures.some(f =>
      pos.x < f.x + f.width  && pos.x + from.width  > f.x &&
      pos.y < f.y + f.height && pos.y + from.height > f.y
    )
    if (wouldOverlap) return s

    const newId = generateId()

    let newCode: string | undefined
    if (from.locationCode) {
      const p = parseCode(from.locationCode)
      if (p) {
        const candidate = `${p.prefix}-${p.section + 1}`
        // Block if that code already exists — prevents duplicate from a detached coded piece
        if (s.fixtures.some(f => f.locationCode === candidate)) return s
        newCode = candidate
      }
    }

    // If the new fixture lands exactly where a chain head sits, link across the gap
    const EPS = 0.01
    const nextNeighbor = s.fixtures.find(f => {
      if (f.prevId) return false  // only open heads
      switch (direction) {
        case 'right': return Math.abs((pos.x + from.width) - f.x) < EPS && Math.abs(pos.y - f.y) < EPS && Math.abs(from.height - f.height) < EPS
        case 'left':  return Math.abs(f.x + f.width - pos.x) < EPS && Math.abs(pos.y - f.y) < EPS && Math.abs(from.height - f.height) < EPS
        case 'down':  return Math.abs((pos.y + from.height) - f.y) < EPS && Math.abs(pos.x - f.x) < EPS && Math.abs(from.width - f.width) < EPS
        case 'up':    return Math.abs(f.y + f.height - pos.y) < EPS && Math.abs(pos.x - f.x) < EPS && Math.abs(from.width - f.width) < EPS
      }
    })

    const newFixture: Fixture = {
      id: newId,
      type: from.type,
      x: pos.x,
      y: pos.y,
      width: from.width,
      height: from.height,
      rotation: from.rotation,
      label: from.label,
      locationCode: newCode,
      prevId: fromId,
      nextId: nextNeighbor?.id
    }

    const fixtures = [
      ...s.fixtures.map(f => {
        if (f.id === fromId) return { ...f, nextId: newId }
        if (nextNeighbor && f.id === nextNeighbor.id) return { ...f, prevId: newId }
        return f
      }),
      newFixture
    ]

    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   null,
      selectedChainAnchor: findChainAnchorId(fixtures, newId)
    }
  }),

  detachAndMove: (id, newX, newY) => set((s) => {
    const fixture = s.fixtures.find(f => f.id === id)
    if (!fixture) return s

    // Unlink and SPLIT — do not bridge prev→next; that would create a chain with a physical gap
    const fixtures = s.fixtures.map(f => {
      if (f.id === id)             return { ...f, prevId: undefined, nextId: undefined, x: newX, y: newY }
      if (f.id === fixture.prevId) return { ...f, nextId: undefined }  // prev becomes new tail
      if (f.id === fixture.nextId) return { ...f, prevId: undefined }  // next becomes new head
      return f
    })

    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   id,
      selectedChainAnchor: null
    }
  }),

  rejoinBoth: (id, prevNeighborId, nextNeighborId, x, y) => set((s) => {
    const prev = s.fixtures.find(f => f.id === prevNeighborId)
    const next = s.fixtures.find(f => f.id === nextNeighborId)
    if (!prev || !next) return s
    if (prev.nextId)  return s  // prev tail already occupied
    if (next.prevId)  return s  // next head already occupied

    const fixtures = s.fixtures.map(f => {
      if (f.id === id)            return { ...f, x, y, prevId: prevNeighborId, nextId: nextNeighborId }
      if (f.id === prevNeighborId) return { ...f, nextId: id }
      if (f.id === nextNeighborId) return { ...f, prevId: id }
      return f
    })

    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   null,
      selectedChainAnchor: findChainAnchorId(fixtures, id)
    }
  }),

  rejoinChain: (id, neighborId, side, x, y) => set((s) => {
    const neighbor = s.fixtures.find(f => f.id === neighborId)
    if (!neighbor) return s
    if (side === 'after'  && neighbor.nextId)  return s  // neighbor tail already occupied
    if (side === 'before' && neighbor.prevId)  return s  // neighbor head already occupied

    const fixtures = s.fixtures.map(f => {
      if (f.id === id) {
        // Update position AND chain links in one step so render sees them together
        return side === 'after'
          ? { ...f, x, y, prevId: neighborId, nextId: undefined }
          : { ...f, x, y, prevId: undefined, nextId: neighborId }
      }
      if (f.id === neighborId) {
        return side === 'after' ? { ...f, nextId: id } : { ...f, prevId: id }
      }
      return f
    })

    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   null,
      selectedChainAnchor: findChainAnchorId(fixtures, id)
    }
  }),

  linkChains: (tailId, headId) => set((s) => {
    const tail = s.fixtures.find(f => f.id === tailId)
    const head = s.fixtures.find(f => f.id === headId)
    if (!tail || !head) return s
    if (tail.nextId || head.prevId) return s  // ends already occupied
    const fixtures = s.fixtures.map(f => {
      if (f.id === tailId) return { ...f, nextId: headId }
      if (f.id === headId) return { ...f, prevId: tailId }
      return f
    })
    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   null,
      selectedChainAnchor: findChainAnchorId(fixtures, tailId)
    }
  }),

  duplicateSelected: (dx, dy) => set((s) => {
    if (s.selectedFixtureId) {
      const src = s.fixtures.find(f => f.id === s.selectedFixtureId)
      if (!src) return s
      const newId = generateId()
      const copy: Fixture = {
        ...src,
        id: newId,
        x: Math.round((src.x + dx) * 100) / 100,
        y: Math.round((src.y + dy) * 100) / 100,
        locationCode: undefined,
        prevId: undefined,
        nextId: undefined
      }
      return {
        ...withHistory(s),
        fixtures: [...s.fixtures, copy],
        selectedFixtureId: newId,
        selectedChainAnchor: null
      }
    }

    if (s.selectedChainAnchor) {
      const members = getChainMembers(s.fixtures, s.selectedChainAnchor)
      if (members.length === 0) return s

      const idMap = new Map<string, string>()
      for (const m of members) idMap.set(m.id, generateId())

      const copies: Fixture[] = members.map(m => ({
        ...m,
        id: idMap.get(m.id)!,
        x: Math.round((m.x + dx) * 100) / 100,
        y: Math.round((m.y + dy) * 100) / 100,
        locationCode: undefined,
        prevId: m.prevId ? idMap.get(m.prevId) : undefined,
        nextId: m.nextId ? idMap.get(m.nextId) : undefined
      }))

      const newHead = copies.find(c => !c.prevId)!
      return {
        ...withHistory(s),
        fixtures: [...s.fixtures, ...copies],
        selectedFixtureId: null,
        selectedChainAnchor: newHead.id
      }
    }

    if (s.multiSelectedIds.length > 0) {
      const idSet = new Set(s.multiSelectedIds)
      const srcs = s.fixtures.filter(f => idSet.has(f.id))
      if (srcs.length === 0) return s

      const idMap = new Map<string, string>()
      for (const src of srcs) idMap.set(src.id, generateId())

      const copies: Fixture[] = srcs.map(src => ({
        ...src,
        id: idMap.get(src.id)!,
        x: Math.round((src.x + dx) * 100) / 100,
        y: Math.round((src.y + dy) * 100) / 100,
        locationCode: undefined,
        // Preserve chain links only between fixtures within the selection
        prevId: src.prevId && idMap.has(src.prevId) ? idMap.get(src.prevId) : undefined,
        nextId: src.nextId && idMap.has(src.nextId) ? idMap.get(src.nextId) : undefined
      }))

      return {
        ...withHistory(s),
        fixtures: [...s.fixtures, ...copies],
        selectedFixtureId:   null,
        selectedChainAnchor: null,
        multiSelectedIds:    copies.map(c => c.id)
      }
    }

    return s
  }),

  setMultiSelected: (ids) => set({
    multiSelectedIds:    ids,
    selectedFixtureId:   null,
    selectedChainAnchor: null
  }),

  toggleMultiSelect: (id) => set((s) => ({
    multiSelectedIds: s.multiSelectedIds.includes(id)
      ? s.multiSelectedIds.filter(i => i !== id)
      : [...s.multiSelectedIds, id],
    selectedFixtureId:   null,
    selectedChainAnchor: null
  })),

  addToMultiSelected: (ids) => set((s) => ({
    selectedFixtureId:   null,
    selectedChainAnchor: null,
    multiSelectedIds:    Array.from(new Set([...s.multiSelectedIds, ...ids]))
  })),

  moveMulti: (ids, dx, dy) => set((s) => ({
    ...withHistory(s),
    fixtures: s.fixtures.map(f =>
      ids.includes(f.id)
        ? { ...f, x: Math.round((f.x + dx) * 100) / 100, y: Math.round((f.y + dy) * 100) / 100 }
        : f
    )
  })),

  deleteMulti: (ids) => set((s) => {
    const idSet = new Set(ids)
    const fixtures = s.fixtures
      .filter(f => !idSet.has(f.id))
      .map(f => ({
        ...f,
        prevId: f.prevId && idSet.has(f.prevId) ? undefined : f.prevId,
        nextId: f.nextId && idSet.has(f.nextId) ? undefined : f.nextId
      }))
    return {
      ...withHistory(s),
      fixtures,
      selectedFixtureId:   null,
      selectedChainAnchor: null,
      multiSelectedIds:    []
    }
  }),

  rotateMulti: (ids) => set((s) => {
    if (ids.length === 0) return s
    const idSet = new Set(ids)
    const selected = s.fixtures.filter(f => idSet.has(f.id))
    if (selected.length === 0) return s

    const minX = Math.min(...selected.map(f => f.x))
    const minY = Math.min(...selected.map(f => f.y))
    const maxX = Math.max(...selected.map(f => f.x + f.width))
    const maxY = Math.max(...selected.map(f => f.y + f.height))
    const gcX = (minX + maxX) / 2
    const gcY = (minY + maxY) / 2

    const updates = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const f of selected) {
      const fcX = f.x + f.width  / 2
      const fcY = f.y + f.height / 2
      const dx = fcX - gcX
      const dy = fcY - gcY
      // 90° clockwise in screen coords (y-down): new_dx = -dy, new_dy = dx
      const newFcX = gcX - dy
      const newFcY = gcY + dx
      const newW = Math.round(f.height * 100) / 100
      const newH = Math.round(f.width  * 100) / 100
      updates.set(f.id, {
        x: Math.round((newFcX - newW / 2) * 100) / 100,
        y: Math.round((newFcY - newH / 2) * 100) / 100,
        width:  newW,
        height: newH
      })
    }

    return {
      ...withHistory(s),
      fixtures: s.fixtures.map(f => {
        const u = updates.get(f.id)
        return u ? { ...f, ...u } : f
      })
    }
  }),

  selectFixture: (id) => set({ selectedFixtureId: id, selectedChainAnchor: null, multiSelectedIds: [] }),

  selectChain: (id) => set((s) => ({
    selectedFixtureId:   null,
    selectedChainAnchor: findChainAnchorId(s.fixtures, id),
    multiSelectedIds:    []
  })),

  deselectAll: () => set({ selectedFixtureId: null, selectedChainAnchor: null, multiSelectedIds: [] }),

  scaleAllFixtures: (factor) => set((s) => ({
    fixtures: s.fixtures.map((f) => ({
      ...f,
      x:      Math.round(f.x      * factor * 100) / 100,
      y:      Math.round(f.y      * factor * 100) / 100,
      width:  Math.round(f.width  * factor * 100) / 100,
      height: Math.round(f.height * factor * 100) / 100
    })),
    past: [], future: [],
    selectedChainAnchor: null
  }))
}))
