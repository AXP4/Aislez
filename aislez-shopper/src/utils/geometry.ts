export interface Point { x: number; y: number }

/** Standard ray-casting point-in-polygon test. */
function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** +1 or -1 depending on which winding direction this polygon happens to use, so "outward" can be computed regardless of draw direction. */
function outwardRotationSign(polygon: Point[]): 1 | -1 {
  const [p0, p1] = polygon
  const dx = p1.x - p0.x, dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2
  const nx = -dy / len, ny = dx / len // +90° rotation
  const probe = { x: midX + nx * 1e-3, y: midY + ny * 1e-3 }
  return pointInPolygon(probe, polygon) ? -1 : 1
}

/** Outward unit normal of polygon edge `edgeIndex` (from polygon[i] to polygon[i+1]). */
export function edgeOutwardNormal(polygon: Point[], edgeIndex: number): Point {
  const rotateSign = outwardRotationSign(polygon)
  const n = polygon.length
  const p1 = polygon[edgeIndex]
  const p2 = polygon[(edgeIndex + 1) % n]
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.hypot(dx, dy) || 1
  return { x: (rotateSign * -dy) / len, y: (rotateSign * dx) / len }
}

/**
 * Offsets each edge of a rectilinear (axis-aligned, right-angle-only) polygon outward by its own
 * thickness, producing the outer boundary of a variable-width border band — same idea as
 * Builder's `offsetRectilinearPolygonOutward` (independently reimplemented here, not shared code:
 * the two apps intentionally share nothing). Every corner is 90°/270° (guaranteed by Builder's
 * perimeter draw tool, which only allows perpendicular segments), so adjacent shifted edges meet
 * exactly at their intersection with no miter math — each corner's x comes from whichever
 * neighboring edge is vertical, its y from whichever is horizontal.
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
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const len = Math.hypot(dx, dy) || 1
    const normal = { x: (rotateSign * -dy) / len, y: (rotateSign * dx) / len }
    const t = thicknessPerEdge[i] ?? 0
    shiftedConst.push(horiz ? p1.y + normal.y * t : p1.x + normal.x * t)
  }

  const outer: Point[] = []
  for (let j = 0; j < n; j++) {
    const e1 = (j - 1 + n) % n // edge ending at corner j
    const e2 = j // edge starting at corner j
    const x = isHorizontal[e1] ? shiftedConst[e2] : shiftedConst[e1]
    const y = isHorizontal[e1] ? shiftedConst[e1] : shiftedConst[e2]
    outer.push({ x, y })
  }
  return outer
}

/** Point at parametric distance `t` along the segment p1→p2 (length precomputed by the caller). */
export function pointAt(p1: Point, p2: Point, length: number, t: number): Point {
  const ux = (p2.x - p1.x) / length, uy = (p2.y - p1.y) / length
  return { x: p1.x + ux * t, y: p1.y + uy * t }
}
