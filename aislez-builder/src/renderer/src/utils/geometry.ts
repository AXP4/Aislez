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
