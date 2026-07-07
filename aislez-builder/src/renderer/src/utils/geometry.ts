export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

export interface EdgeProjection {
  /** Distance from `a` to the closest point on segment a→b, along the segment */
  offset: number
  /** Length of the segment a→b */
  length: number
  /** Squared distance from `p` to the closest point (avoids a sqrt when just comparing) */
  distSq: number
}

/** Projects `p` onto segment a→b, clamped to the segment's extent */
export function projectOntoSegment(p: Point, a: Point, b: Point): EdgeProjection {
  const abx = b.x - a.x, aby = b.y - a.y
  const length = Math.hypot(abx, aby)
  if (length === 0) return { offset: 0, length: 0, distSq: (p.x - a.x) ** 2 + (p.y - a.y) ** 2 }
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (length * length)
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + abx * t, cy = a.y + aby * t
  return { offset: t * length, length, distSq: (p.x - cx) ** 2 + (p.y - cy) ** 2 }
}

/** Axis-aligned overlap test; a small epsilon so edges merely touching don't count as overlapping */
export function rectsOverlap(a: Rect, b: Rect, eps = 0.01): boolean {
  return a.x < b.x + b.width  - eps && a.x + a.width  > b.x + eps &&
         a.y < b.y + b.height - eps && a.y + a.height > b.y + eps
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersects = (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
  if (Math.abs(val) < 1e-9) return 0
  return val > 0 ? 1 : 2
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
         q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const o1 = orientation(p1, p2, p3)
  const o2 = orientation(p1, p2, p4)
  const o3 = orientation(p3, p4, p1)
  const o4 = orientation(p3, p4, p2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p3, p2)) return true
  if (o2 === 0 && onSegment(p1, p4, p2)) return true
  if (o3 === 0 && onSegment(p3, p1, p4)) return true
  if (o4 === 0 && onSegment(p3, p2, p4)) return true
  return false
}

/**
 * True if two axis-aligned segments run along the same line and their ranges
 * overlap by more than a single touching point — i.e. one is being retraced
 * over (or through) the other, not just meeting it end-to-end.
 */
function segmentsOverlapCollinearly(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const aHoriz = a1.y === a2.y
  const bHoriz = b1.y === b2.y
  if (aHoriz !== bHoriz) return false
  if (aHoriz) {
    if (Math.abs(a1.y - b1.y) > 1e-9) return false
    const aLo = Math.min(a1.x, a2.x), aHi = Math.max(a1.x, a2.x)
    const bLo = Math.min(b1.x, b2.x), bHi = Math.max(b1.x, b2.x)
    return Math.max(aLo, bLo) < Math.min(aHi, bHi) - 1e-9
  }
  if (Math.abs(a1.x - b1.x) > 1e-9) return false
  const aLo = Math.min(a1.y, a2.y), aHi = Math.max(a1.y, a2.y)
  const bLo = Math.min(b1.y, b2.y), bHi = Math.max(b1.y, b2.y)
  return Math.max(aLo, bLo) < Math.min(aHi, bHi) - 1e-9
}

/**
 * True if adding segment `from`→`to` to a perimeter sketch already made up of
 * `points` would make the outline non-simple (retrace an earlier segment, or
 * cross one, carving out a second enclosed space instead of one clean loop).
 * `from` is always the last placed point, so it legitimately shares an
 * endpoint with the immediately-preceding segment — and, when closing the
 * loop, `to` legitimately shares a point with the very first segment too.
 * Those two adjacencies are expected and only rejected if they overlap
 * *beyond* that single shared point (the retrace case); every other existing
 * segment must not touch the new one at all.
 */
export function wouldSegmentSelfIntersect(points: Point[], from: Point, to: Point, isClosingLoop: boolean): boolean {
  const n = points.length
  if (n < 2) return false
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i], p2 = points[i + 1]
    const isPrevAdjacent = i === n - 2
    const isFirstAdjacent = isClosingLoop && i === 0
    if (isPrevAdjacent || isFirstAdjacent) {
      if (segmentsOverlapCollinearly(from, to, p1, p2)) return true
      continue
    }
    if (segmentsIntersect(from, to, p1, p2)) return true
  }
  return false
}

const rectCorners = (r: Rect): Point[] => [
  { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }
]

const rectEdges = (r: Rect): [Point, Point][] => {
  const c = rectCorners(r)
  return [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]]
}

const polygonEdges = (poly: Point[]): [Point, Point][] =>
  poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Point, Point])

/**
 * True only if `rect` sits entirely within the closed polygon: every corner
 * inside AND no polygon edge cuts through it. Corner-only checks would miss
 * a rectangle spanning a concave notch (e.g. an L-shaped store) where all 4
 * corners can land inside while the middle of the rectangle pokes outside.
 * Corners are inset by `eps` first so a fixture placed flush against the
 * perimeter (the common case) isn't rejected by boundary floating-point noise.
 */
export function rectInsidePolygon(rect: Rect, polygon: Point[], eps = 0.01): boolean {
  if (polygon.length < 3) return true
  const inset: Rect = {
    x: rect.x + eps, y: rect.y + eps,
    width: Math.max(0, rect.width - 2 * eps), height: Math.max(0, rect.height - 2 * eps)
  }
  if (!rectCorners(inset).every((c) => pointInPolygon(c, polygon))) return false

  const pEdges = polygonEdges(polygon)
  for (const [a, b] of rectEdges(inset)) {
    for (const [c, d] of pEdges) {
      if (segmentsIntersect(a, b, c, d)) return false
    }
  }
  return true
}

/**
 * +1 or -1: which 90° rotation of an edge direction points outward, for
 * *every* edge of this simple polygon. Winding is a global, consistent
 * property, so testing it once on edge 0 (nudge off the edge along a
 * candidate normal, check with pointInPolygon) fixes the answer for the
 * whole polygon — including concave/orthogonal shapes like an L-shaped store.
 */
function outwardRotationSign(polygon: Point[]): 1 | -1 {
  const [p0, p1] = polygon
  const dx = p1.x - p0.x, dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2
  const nx = -dy / len, ny = dx / len  // +90° rotation
  const probe = { x: midX + nx * 1e-3, y: midY + ny * 1e-3 }
  return pointInPolygon(probe, polygon) ? -1 : 1
}

/** Outward unit normal of polygon edge `edgeIndex` (from polygon[i] to polygon[i+1]) */
function edgeOutwardNormal(polygon: Point[], edgeIndex: number, rotateSign: 1 | -1): Point {
  const n = polygon.length
  const p1 = polygon[edgeIndex]
  const p2 = polygon[(edgeIndex + 1) % n]
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  return { x: (rotateSign * -dy) / len, y: (rotateSign * dx) / len }
}

/** Outward unit normal of polygon edge `edgeIndex` — used to drive the thickness drag handle. */
export function getEdgeOutwardNormal(polygon: Point[], edgeIndex: number): Point {
  return edgeOutwardNormal(polygon, edgeIndex, outwardRotationSign(polygon))
}

/**
 * Offsets each edge of a rectilinear (axis-aligned, right-angle-only) polygon
 * outward by its own thickness, producing the outer boundary of a
 * variable-width border band. Since every corner is 90°/270° (guaranteed by
 * the perimeter draw tool's perpendicular-only snapping), adjacent shifted
 * edges meet exactly at their intersection with no miter math: each corner's
 * x comes from whichever neighboring edge is vertical, its y from whichever
 * is horizontal.
 */
export function offsetRectilinearPolygonOutward(polygon: Point[], thicknessPerEdge: number[]): Point[] {
  const n = polygon.length
  if (n < 3) return polygon
  const rotateSign = outwardRotationSign(polygon)

  const isHorizontal: boolean[] = []
  const shiftedConst: number[] = []
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i], p2 = polygon[(i + 1) % n]
    const horiz = p1.y === p2.y
    isHorizontal.push(horiz)
    const normal = edgeOutwardNormal(polygon, i, rotateSign)
    const t = thicknessPerEdge[i] ?? 0
    shiftedConst.push(horiz ? p1.y + normal.y * t : p1.x + normal.x * t)
  }

  const outer: Point[] = []
  for (let j = 0; j < n; j++) {
    const e1 = (j - 1 + n) % n  // edge ending at corner j
    const e2 = j                // edge starting at corner j
    const x = isHorizontal[e1] ? shiftedConst[e2] : shiftedConst[e1]
    const y = isHorizontal[e1] ? shiftedConst[e1] : shiftedConst[e2]
    outer.push({ x, y })
  }
  return outer
}

/**
 * Stretches (distances from outline[edgeIndex] measured ALONG the edge, i.e.
 * the same parametric space pointAt-style renderers use) where an interior
 * wall sits flush against edge `edgeIndex` — one of the wall's four sides
 * runs parallel to the edge, within FLUSH_EPS of its line, and overlaps its
 * span. Used to suppress the perimeter's inner black outline at those
 * stretches so a connected wall reads as one continuous surface.
 */
export const FLUSH_EPS = 0.05

export function wallCoveredIntervals(
  outline: Point[],
  edgeIndex: number,
  walls: { x: number; y: number; width: number; height: number }[]
): [number, number][] {
  const n = outline.length
  const p1 = outline[edgeIndex]
  const p2 = outline[(edgeIndex + 1) % n]
  const horizontal = p1.y === p2.y
  const edgeConst = horizontal ? p1.y : p1.x
  const a1 = horizontal ? p1.x : p1.y
  const a2 = horizontal ? p2.x : p2.y
  const dir = Math.sign(a2 - a1) || 1
  const length = Math.abs(a2 - a1)
  // Distance from p1 along the edge's own direction. Anchoring at min(x/y)
  // instead would silently mirror the intervals on edges that happen to run
  // right-to-left or bottom-to-top (half the edges of any closed loop).
  const toParam = (c: number): number => (c - a1) * dir

  const raw: [number, number][] = []
  for (const w of walls) {
    const sides = horizontal
      ? [{ const: w.y, lo: w.x, hi: w.x + w.width }, { const: w.y + w.height, lo: w.x, hi: w.x + w.width }]
      : [{ const: w.x, lo: w.y, hi: w.y + w.height }, { const: w.x + w.width, lo: w.y, hi: w.y + w.height }]
    for (const side of sides) {
      if (Math.abs(side.const - edgeConst) > FLUSH_EPS) continue
      const t1 = toParam(side.lo)
      const t2 = toParam(side.hi)
      const lo = Math.max(0, Math.min(t1, t2))
      const hi = Math.min(length, Math.max(t1, t2))
      if (hi > lo) raw.push([lo, hi])
    }
  }

  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [s, e] of raw) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  return merged
}

/** Complement of `covered` within [0, length] — the stretches that should still be stroked */
export function invertIntervals(covered: [number, number][], length: number): [number, number][] {
  const gaps: [number, number][] = []
  let cursor = 0
  for (const [s, e] of covered) {
    if (s > cursor) gaps.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < length) gaps.push([cursor, length])
  return gaps
}

/**
 * True if a wall side (given as its constant coordinate and span along the
 * free axis) sits flush against some edge of storeOutline. Mirrors
 * wallCoveredIntervals from the wall's point of view — used to suppress the
 * wall's own outline stroke on the side touching the perimeter, so the two
 * fills read as one continuous surface instead of showing a seam on either
 * side of the join.
 */
export function isWallSideFlushWithOutline(
  outline: Point[], sideConst: number, sideLo: number, sideHi: number, horizontal: boolean
): boolean {
  const n = outline.length
  for (let i = 0; i < n; i++) {
    const p1 = outline[i], p2 = outline[(i + 1) % n]
    const edgeHoriz = p1.y === p2.y
    if (edgeHoriz !== horizontal) continue
    const edgeConst = edgeHoriz ? p1.y : p1.x
    if (Math.abs(edgeConst - sideConst) > FLUSH_EPS) continue
    const edgeMin = edgeHoriz ? Math.min(p1.x, p2.x) : Math.min(p1.y, p2.y)
    const edgeMax = edgeHoriz ? Math.max(p1.x, p2.x) : Math.max(p1.y, p2.y)
    if (Math.min(sideHi, edgeMax) > Math.max(sideLo, edgeMin)) return true
  }
  return false
}

/**
 * True if a wall side (same shape as isWallSideFlushWithOutline) sits inside
 * — or flush against — any other wall's rectangle. Suppresses a wall's own
 * border wherever another wall's fill already covers that side, so two
 * overlapping or adjacent walls read as one shape with a single outline
 * around the outside, not two independently-outlined rectangles stacked on
 * top of each other. Whole-side (not partial-interval) like the outline
 * check above — a side touching another wall along only part of its length
 * still has its whole border suppressed.
 */
export function wallSideTouchesOtherWalls(
  sideConst: number, sideLo: number, sideHi: number, horizontal: boolean,
  otherWalls: { x: number; y: number; width: number; height: number }[]
): boolean {
  for (const o of otherWalls) {
    const oNear = horizontal ? o.y : o.x
    const oFar  = horizontal ? o.y + o.height : o.x + o.width
    if (sideConst < oNear - FLUSH_EPS || sideConst > oFar + FLUSH_EPS) continue
    const oSpanLo = horizontal ? o.x : o.y
    const oSpanHi = horizontal ? o.x + o.width : o.y + o.height
    if (Math.min(sideHi, oSpanHi) > Math.max(sideLo, oSpanLo)) return true
  }
  return false
}
