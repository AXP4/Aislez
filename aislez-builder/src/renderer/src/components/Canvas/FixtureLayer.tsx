import React, { useCallback } from 'react'
import { Layer, Group, Rect, Text, Shape, Line } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { getChainMembers, deriveDirection } from '../../utils/chain'
import { rectsOverlap, rectInsidePolygon } from '../../utils/geometry'
import {
  makeArrow,
  ARROW_GAP_PX, ARROW_RADIUS_PX, ARROW_HIT_PAD, ARROW_COLOR, ARROW_OPACITY
} from './ArrowLayer'
import type { Direction } from '../../utils/chain'
import type { Fixture, FixtureType, CustomFixtureType } from '../../types'

export const FIXTURE_COLORS: Record<FixtureType, string> = {
  shelf:    '#4A90D9',
  chiller:  '#2ECC71',
  bunker:   '#1ABC9C',
  endcap:   '#E67E22',
  sidekick: '#F39C12',
  pallet:   '#8E44AD',
  rack:     '#E74C3C',
  table:    '#16A085',
  bin:      '#D35400',
  custom:   '#888899'
}

const FIXTURE_SNAP_WORLD_UNITS = 0.25  // world-space tolerance; scales with zoom so gap fill works at any zoom level
const DETACH_THRESHOLD_UNITS    = 0.5
const MAX_LABEL_FONT = 13
const MIN_LABEL_FONT = 10
const MIN_CODE_FONT  = 7   // location codes always render — smaller floor than generic labels
const CHAR_WIDTH_RATIO = 0.58
const LINE_HEIGHT      = 1.25
const PADDING          = 0.82

const FIXTURE_ABBREV: Record<FixtureType, string> = {
  shelf:    'SH',
  chiller:  'CH',
  bunker:   'BK',
  endcap:   'EC',
  sidekick: 'SK',
  pallet:   'PL',
  rack:     'RK',
  table:    'TB',
  bin:      'BN',
  custom:   'CU'
}

export function resolveFixtureColor(fixture: Fixture, customTypes: CustomFixtureType[]): string {
  if (fixture.type === 'custom' && fixture.customTypeId) {
    return customTypes.find(t => t.id === fixture.customTypeId)?.color ?? FIXTURE_COLORS.custom
  }
  return FIXTURE_COLORS[fixture.type]
}

export function resolveFixtureAbbrev(fixture: Fixture, customTypes: CustomFixtureType[]): string {
  if (fixture.type === 'custom' && fixture.customTypeId) {
    return customTypes.find(t => t.id === fixture.customTypeId)?.abbrev ?? FIXTURE_ABBREV.custom
  }
  return FIXTURE_ABBREV[fixture.type]
}

interface LabelFit { fontSize: number; wrap: 'word' | 'none' }

function fitLabel(text: string, pw: number, ph: number): LabelFit {
  const W = pw * PADDING
  const H = ph * PADDING

  const singleSize = Math.min(MAX_LABEL_FONT, H, W / Math.max(1, text.length * CHAR_WIDTH_RATIO))
  if (singleSize >= MIN_LABEL_FONT) return { fontSize: singleSize, wrap: 'none' }

  const words = text.split(' ')
  if (words.length > 1) {
    const longestWord = Math.max(...words.map((w) => w.length))
    const wrapSize = Math.min(
      MAX_LABEL_FONT,
      H / (2 * LINE_HEIGHT),
      W / Math.max(1, longestWord * CHAR_WIDTH_RATIO)
    )
    if (wrapSize >= MIN_LABEL_FONT) return { fontSize: wrapSize, wrap: 'word' }
  }

  return { fontSize: singleSize, wrap: 'none' }
}

interface ResolvedLabel {
  text: string; fontSize: number; wrap: 'word' | 'none'
  visible: boolean; needsTooltip: boolean
}

function resolveLabel(
  displayText: string, abbrev: string,
  pw: number, ph: number,
  isCode: boolean
): ResolvedLabel {
  const minFont = isCode ? MIN_CODE_FONT : MIN_LABEL_FONT
  const full = fitLabel(displayText, pw, ph)

  if (full.fontSize >= minFont)
    return { text: displayText, fontSize: full.fontSize, wrap: full.wrap, visible: true, needsTooltip: false }

  if (isCode) {
    // Location codes always show — clamp to minimum and let Konva ellipsis clip overflow
    return { text: displayText, fontSize: minFont, wrap: 'none', visible: true, needsTooltip: false }
  }

  const abbrevFit = fitLabel(abbrev, pw, ph)
  if (abbrevFit.fontSize >= MIN_LABEL_FONT)
    return { text: abbrev, fontSize: abbrevFit.fontSize, wrap: 'none', visible: true, needsTooltip: false }

  return { text: '', fontSize: abbrevFit.fontSize, wrap: 'none', visible: false, needsTooltip: true }
}

/** A fixture can't land on a wall or outside the store's perimeter (world units) */
function hitsWallOrLeavesPerimeter(rect: { x: number; y: number; width: number; height: number }): boolean {
  const { walls } = useCanvasStore.getState()
  if (walls.some((w) => rectsOverlap(rect, w))) return true
  const outline = useProjectStore.getState().settings?.storeOutline
  return outline ? !rectInsidePolygon(rect, outline) : false
}

/**
 * Corner-to-corner snapping in screen space.
 * pos is stage-container pixels. Returns stage-container pixels.
 * `others` only needs position/size (fixtures use it against other fixtures,
 * walls against other walls — see WallLayer.tsx).
 */
export function computeSnap(
  posX: number, posY: number,
  pw: number, ph: number,
  others: AlignBox[],
  pixelsPerUnit: number,
  gridSizePx: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  const pwS = pw * zoom
  const phS = ph * zoom
  const myCorners: [number, number][] = [[0, 0], [pwS, 0], [0, phS], [pwS, phS]]

  const snapThresholdPx = FIXTURE_SNAP_WORLD_UNITS * pixelsPerUnit * zoom
  let bestDist = snapThresholdPx + 1
  let snapX: number | null = null
  let snapY: number | null = null

  for (const other of others) {
    const oL = other.x * pixelsPerUnit * zoom + panX
    const oR = (other.x + other.width) * pixelsPerUnit * zoom + panX
    const oT = other.y * pixelsPerUnit * zoom + panY
    const oB = (other.y + other.height) * pixelsPerUnit * zoom + panY
    const theirCorners: [number, number][] = [[oL, oT], [oR, oT], [oL, oB], [oR, oB]]

    for (const [mdx, mdy] of myCorners) {
      const mcx = posX + mdx
      const mcy = posY + mdy
      for (const [tcx, tcy] of theirCorners) {
        const dist = Math.hypot(mcx - tcx, mcy - tcy)
        if (dist < bestDist) {
          bestDist = dist
          snapX = tcx - mdx
          snapY = tcy - mdy
        }
      }
    }
  }

  if (snapX === null) {
    let bestGridDist = Infinity
    for (const [mdx, mdy] of myCorners) {
      const mcx = posX + mdx
      const mcy = posY + mdy
      const gridStepS = gridSizePx * zoom
      const nearX = Math.round((mcx - panX) / gridStepS) * gridStepS + panX
      const nearY = Math.round((mcy - panY) / gridStepS) * gridStepS + panY
      const dist = Math.hypot(mcx - nearX, mcy - nearY)
      if (dist < bestGridDist) {
        bestGridDist = dist
        snapX = nearX - mdx
        snapY = nearY - mdy
      }
    }
  }

  return { x: snapX ?? posX, y: snapY ?? posY }
}

// ─── Ctrl+dblclick tracking ──────────────────────────────────────────────────
// Module-level so it survives React re-renders / component re-mounts that happen
// when a fixture moves between the individual Layer and MultiSelectGroup on the
// first Ctrl+click — if we used a ref it would reset on the new instance.
let _lastCtrlClick: { id: string; time: number } | null = null

// ─── Alignment guides ────────────────────────────────────────────────────────

const _guideRefs: { h: Konva.Line | null; v: Konva.Line | null } = { h: null, v: null }
export const GUIDE_THRESHOLD_PX = 8

export function updateGuides(guideY: number | null, guideX: number | null): void {
  const { zoom } = useUiStore.getState()
  const { pixelsPerUnit: ppu } = useProjectStore.getState()
  if (_guideRefs.h) {
    _guideRefs.h.visible(guideY !== null)
    if (guideY !== null) {
      const py = guideY * ppu
      _guideRefs.h.points([-100000, py, 100000, py])
      _guideRefs.h.strokeWidth(1 / zoom)
    }
    _guideRefs.h.getLayer()?.batchDraw()
  }
  if (_guideRefs.v) {
    _guideRefs.v.visible(guideX !== null)
    if (guideX !== null) {
      const px = guideX * ppu
      _guideRefs.v.points([px, -100000, px, 100000])
      _guideRefs.v.strokeWidth(1 / zoom)
    }
    _guideRefs.v.getLayer()?.batchDraw()
  }
}

interface AlignResult { x: number; y: number; guideX: number | null; guideY: number | null }

/** Anything with a position and size can participate in alignment snapping (fixtures, walls). */
export interface AlignBox { x: number; y: number; width: number; height: number }

export function computeAlignmentSnap(
  worldX: number, worldY: number,
  w: number, h: number,
  others: AlignBox[],
  zoom: number,
  pixelsPerUnit: number
): AlignResult {
  const threshold = GUIDE_THRESHOLD_PX / (zoom * pixelsPerUnit)
  const dX = [worldX, worldX + w, worldX + w / 2]
  const dY = [worldY, worldY + h, worldY + h / 2]
  let bestX: { snap: number; guide: number; dist: number } | null = null
  let bestY: { snap: number; guide: number; dist: number } | null = null

  for (const o of others) {
    const oX = [o.x, o.x + o.width,  o.x + o.width  / 2]
    const oY = [o.y, o.y + o.height, o.y + o.height / 2]
    for (let di = 0; di < 3; di++) {
      for (let oi = 0; oi < 3; oi++) {
        const dx = Math.abs(dX[di] - oX[oi])
        if (dx < threshold && (!bestX || dx < bestX.dist)) {
          const snap = di === 0 ? oX[oi] : di === 1 ? oX[oi] - w : oX[oi] - w / 2
          bestX = { snap, guide: oX[oi], dist: dx }
        }
        const dy = Math.abs(dY[di] - oY[oi])
        if (dy < threshold && (!bestY || dy < bestY.dist)) {
          const snap = di === 0 ? oY[oi] : di === 1 ? oY[oi] - h : oY[oi] - h / 2
          bestY = { snap, guide: oY[oi], dist: dy }
        }
      }
    }
  }

  return {
    x:      bestX ? bestX.snap  : worldX,
    y:      bestY ? bestY.snap  : worldY,
    guideX: bestX ? bestX.guide : null,
    guideY: bestY ? bestY.guide : null
  }
}

// ─── findChainJoin ───────────────────────────────────────────────────────────

type NeighborMatch = { id: string; x: number; y: number }

/**
 * Given a fixture dropped at (newX, newY) with dimensions fw×fh, scan all
 * other fixtures and return the best open tail (afterMatch) and open head
 * (beforeMatch) that it is adjacent to, respecting direction locks.
 * Pass the fixtures array AFTER any store mutations so state is current.
 */
function findChainJoin(
  fixId: string,
  newX: number, newY: number,
  fw: number, fh: number,
  all: Fixture[]
): { afterMatch: NeighborMatch | null; beforeMatch: NeighborMatch | null } {
  const TOL = 0.15
  const byId = new Map(all.map(f => [f.id, f]))
  let afterMatch:  NeighborMatch | null = null
  let beforeMatch: NeighborMatch | null = null

  for (const other of all) {
    if (other.id === fixId) continue

    // ── TAIL: dropped fixture goes AFTER `other` ──────────────────────
    if (!other.nextId) {
      const prev = other.prevId ? byId.get(other.prevId) ?? null : null

      if (!prev) {
        // Standalone — all directions valid (left/above handled in head block)
        if (Math.abs(newX - (other.x + other.width)) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
          afterMatch = { id: other.id, x: other.x + other.width, y: other.y }
        if (Math.abs(newY - (other.y + other.height)) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
          afterMatch = { id: other.id, x: other.x, y: other.y + other.height }
      } else {
        // Chain tail — locked to chain direction
        switch (deriveDirection(prev, other)) {
          case 'right':
            if (Math.abs(newX - (other.x + other.width)) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
              afterMatch = { id: other.id, x: other.x + other.width, y: other.y }
            break
          case 'left':
            if (Math.abs(newX + fw - other.x) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
              afterMatch = { id: other.id, x: other.x - fw, y: other.y }
            break
          case 'down':
            if (Math.abs(newY - (other.y + other.height)) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
              afterMatch = { id: other.id, x: other.x, y: other.y + other.height }
            break
          case 'up':
            if (Math.abs(newY + fh - other.y) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
              afterMatch = { id: other.id, x: other.x, y: other.y - fh }
            break
        }
      }
    }

    // ── HEAD: dropped fixture goes BEFORE `other` ─────────────────────
    if (!other.prevId) {
      const next = other.nextId ? byId.get(other.nextId) ?? null : null

      if (!next) {
        // Standalone — left and above only (right/below handled in tail block)
        if (Math.abs(newX + fw - other.x) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
          beforeMatch = { id: other.id, x: other.x - fw, y: other.y }
        if (Math.abs(newY + fh - other.y) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
          beforeMatch = { id: other.id, x: other.x, y: other.y - fh }
      } else {
        // Chain head — locked to opposite of chain direction
        switch (deriveDirection(other, next)) {
          case 'right':
            if (Math.abs(newX + fw - other.x) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
              beforeMatch = { id: other.id, x: other.x - fw, y: other.y }
            break
          case 'left':
            if (Math.abs(newX - (other.x + other.width)) < TOL && Math.abs(newY - other.y) < TOL && Math.abs(fh - other.height) < TOL)
              beforeMatch = { id: other.id, x: other.x + other.width, y: other.y }
            break
          case 'down':
            if (Math.abs(newY + fh - other.y) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
              beforeMatch = { id: other.id, x: other.x, y: other.y - fh }
            break
          case 'up':
            if (Math.abs(newY - (other.y + other.height)) < TOL && Math.abs(newX - other.x) < TOL && Math.abs(fw - other.width) < TOL)
              beforeMatch = { id: other.id, x: other.x, y: other.y + other.height }
            break
        }
      }
    }
  }

  return { afterMatch, beforeMatch }
}

// ─── FixtureShape ────────────────────────────────────────────────────────────

interface FixtureShapeProps {
  fixture: Fixture
  isSelected: boolean
  isChainSelected: boolean
  isDuplicate: boolean
  isMultiSelected: boolean
  /** false when inside ChainGroup — disables individual drag */
  ownDraggable?: boolean
}

function FixtureShape({
  fixture, isSelected, isChainSelected, isDuplicate, isMultiSelected, ownDraggable = true
}: FixtureShapeProps): React.ReactElement {
  const { moveFixture, detachAndMove, selectFixture, selectChain, extendChain, rejoinChain, rejoinBoth, toggleMultiSelect, addToMultiSelected, moveMulti } = useCanvasStore()
  const { pixelsPerUnit, gridSizePx, formatUnitShort, customFixtureTypes } = useProjectStore()
  const { gridMode, showTooltip, hideTooltip } = useUiStore()

  const isHighlighted = isSelected || isChainSelected

  const fill = resolveFixtureColor(fixture, customFixtureTypes)
  const px = fixture.x * pixelsPerUnit
  const py = fixture.y * pixelsPerUnit
  const pw = fixture.width  * pixelsPerUnit
  const ph = fixture.height * pixelsPerUnit

  const displayText = fixture.locationCode ?? fixture.label
  const { text: labelText, fontSize, wrap, visible: labelVisible, needsTooltip } =
    resolveLabel(displayText, resolveFixtureAbbrev(fixture, customFixtureTypes), pw, ph, !!fixture.locationCode)

  const tooltipText = [
    fixture.label,
    `${formatUnitShort(fixture.width)} × ${formatUnitShort(fixture.height)}`
  ].join('\n')

  // Ctrl+click: toggle single; Ctrl+dblclick: add whole chain to multi-selection.
  // Dblclick is detected via module-level timing (_lastCtrlClick) rather than onDblClick,
  // because the first Ctrl+click causes a React re-render that moves the fixture to a
  // different Konva node — Konva would then not recognise the second click as a dblclick.
  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    e.cancelBubble = true
    if (e.evt.ctrlKey) {
      const now = Date.now()
      if (_lastCtrlClick?.id === fixture.id && now - _lastCtrlClick.time < 400) {
        _lastCtrlClick = null
        const { fixtures: all } = useCanvasStore.getState()
        const ids = (fixture.prevId || fixture.nextId)
          ? getChainMembers(all, fixture.id).map(f => f.id)
          : [fixture.id]
        addToMultiSelected(ids)
        return
      }
      _lastCtrlClick = { id: fixture.id, time: now }
      toggleMultiSelect(fixture.id)
      return
    }
    _lastCtrlClick = null
    selectFixture(fixture.id)
  }

  // Plain dblclick → chain-select (Ctrl case handled above in handleClick)
  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (e.evt.ctrlKey) return
    e.cancelBubble = true
    if (fixture.prevId || fixture.nextId) selectChain(fixture.id)
    else selectFixture(fixture.id)
  }

  const dragBoundFunc = useCallback(
    (pos: { x: number; y: number }): { x: number; y: number } => {
      const { zoom, panX, panY } = useUiStore.getState()
      const state = useCanvasStore.getState()
      const others: AlignBox[] = [...state.fixtures.filter(f => f.id !== fixture.id), ...state.walls]
      if (gridMode !== 'off') {
        return computeSnap(pos.x, pos.y, pw, ph, others, pixelsPerUnit, gridSizePx, zoom, panX, panY)
      }
      // Free drag — alignment guides
      const worldX = (pos.x - panX) / (zoom * pixelsPerUnit)
      const worldY = (pos.y - panY) / (zoom * pixelsPerUnit)
      const result = computeAlignmentSnap(worldX, worldY, fixture.width, fixture.height, others, zoom, pixelsPerUnit)
      updateGuides(result.guideY, result.guideX)
      return { x: result.x * pixelsPerUnit * zoom + panX, y: result.y * pixelsPerUnit * zoom + panY }
    },
    [fixture.id, fixture.width, fixture.height, pw, ph, pixelsPerUnit, gridSizePx, gridMode]
  )

  const handleDragStart = (): void => {
    // Don't overwrite multi-selection when starting a drag on a member of it
    if (useCanvasStore.getState().multiSelectedIds.includes(fixture.id)) return
    selectFixture(fixture.id)
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>): void => {
    updateGuides(null, null)
    const newX = Math.round(e.target.x() / pixelsPerUnit * 100) / 100
    const newY = Math.round(e.target.y() / pixelsPerUnit * 100) / 100

    // Multi-select drag: move the entire selection by the same delta
    const { multiSelectedIds } = useCanvasStore.getState()
    if (multiSelectedIds.length > 0 && multiSelectedIds.includes(fixture.id)) {
      const dx = newX - fixture.x
      const dy = newY - fixture.y
      moveMulti(multiSelectedIds, dx, dy)
      return
    }

    if (fixture.prevId || fixture.nextId) {
      // Chained: detach only if dragged beyond threshold
      const dist = Math.hypot(newX - fixture.x, newY - fixture.y)
      if (dist >= DETACH_THRESHOLD_UNITS) {
        const all = useCanvasStore.getState().fixtures
        const wouldOverlap = all.some(f =>
          f.id !== fixture.id &&
          newX < f.x + f.width  - 0.01 && newX + fixture.width  > f.x + 0.01 &&
          newY < f.y + f.height - 0.01 && newY + fixture.height > f.y + 0.01
        )
        const invalid = hitsWallOrLeavesPerimeter({ x: newX, y: newY, width: fixture.width, height: fixture.height })
        if (wouldOverlap || invalid) {
          e.target.position({ x: fixture.x * pixelsPerUnit, y: fixture.y * pixelsPerUnit })
        } else {
          detachAndMove(fixture.id, newX, newY)
          if (gridMode !== 'off') {
            const updated = useCanvasStore.getState().fixtures
            const { afterMatch, beforeMatch } = findChainJoin(fixture.id, newX, newY, fixture.width, fixture.height, updated)
            if (afterMatch && beforeMatch) {
              rejoinBoth(fixture.id, afterMatch.id, beforeMatch.id, afterMatch.x, afterMatch.y)
            } else if (afterMatch) {
              rejoinChain(fixture.id, afterMatch.id, 'after', afterMatch.x, afterMatch.y)
            } else if (beforeMatch) {
              rejoinChain(fixture.id, beforeMatch.id, 'before', beforeMatch.x, beforeMatch.y)
            }
          }
        }
      } else {
        e.target.position({ x: fixture.x * pixelsPerUnit, y: fixture.y * pixelsPerUnit })
      }
    } else {
      const all = useCanvasStore.getState().fixtures
      const fw = fixture.width
      const fh = fixture.height

      if (hitsWallOrLeavesPerimeter({ x: newX, y: newY, width: fw, height: fh })) {
        e.target.position({ x: fixture.x * pixelsPerUnit, y: fixture.y * pixelsPerUnit })
        return
      }

      if (gridMode !== 'off') {
        const { afterMatch, beforeMatch } = findChainJoin(fixture.id, newX, newY, fw, fh, all)
        if (afterMatch && beforeMatch) {
          rejoinBoth(fixture.id, afterMatch.id, beforeMatch.id, afterMatch.x, afterMatch.y)
          return
        } else if (afterMatch) {
          rejoinChain(fixture.id, afterMatch.id, 'after', afterMatch.x, afterMatch.y)
          return
        } else if (beforeMatch) {
          rejoinChain(fixture.id, beforeMatch.id, 'before', beforeMatch.x, beforeMatch.y)
          return
        }
      }

      // Grid off, or grid on with no adjacent chain: plain move with overlap check
      const wouldOverlap = all.some(f =>
        f.id !== fixture.id &&
        newX < f.x + f.width  - 0.01 && newX + fw > f.x + 0.01 &&
        newY < f.y + f.height - 0.01 && newY + fh > f.y + 0.01
      )
      if (wouldOverlap) {
        e.target.position({ x: fixture.x * pixelsPerUnit, y: fixture.y * pixelsPerUnit })
        return
      }
      moveFixture(fixture.id, newX, newY)
    }
  }

  const handleMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (needsTooltip) showTooltip(tooltipText, e.evt.clientX + 14, e.evt.clientY - 8)
  }
  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    if (needsTooltip) showTooltip(tooltipText, e.evt.clientX + 14, e.evt.clientY - 8)
  }
  const handleMouseLeave = (): void => { hideTooltip() }

  return (
    <Group
      x={px}
      y={py}
      draggable={ownDraggable}
      dragBoundFunc={ownDraggable ? dragBoundFunc : undefined}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onDragStart={ownDraggable ? handleDragStart : undefined}
      onDragEnd={ownDraggable ? handleDragEnd : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Rect
        width={pw}
        height={ph}
        fill={fill}
        stroke={isHighlighted || isMultiSelected ? '#ffffff' : isDuplicate ? '#e74c3c' : 'rgba(0,0,0,0.2)'}
        strokeWidth={isHighlighted || isMultiSelected ? 2.5 : isDuplicate ? 2 : 1}
        cornerRadius={3}
        shadowColor={isHighlighted ? '#FF6B00' : isMultiSelected ? '#4A90D9' : isDuplicate ? '#e74c3c' : undefined}
        shadowBlur={isHighlighted || isMultiSelected ? 12 : isDuplicate ? 8 : 0}
        shadowOpacity={isHighlighted || isMultiSelected ? 0.9 : 0.5}
      />
      {labelVisible && (
        <Text
          text={labelText}
          width={pw}
          height={ph}
          align="center"
          verticalAlign="middle"
          fontSize={fontSize}
          fontStyle="bold"
          fill="#ffffff"
          wrap={wrap}
          ellipsis={wrap === 'none'}
          listening={false}
        />
      )}

      {/* Standalone arrows — inside Group so they move with the fixture during drag */}
      {isSelected && !fixture.prevId && !fixture.nextId && ownDraggable && (() => {
        const toRad = (deg: number): number => (deg * Math.PI) / 180
        const rad = ARROW_RADIUS_PX
        const ATOL = 0.15
        const allFixtures = useCanvasStore.getState().fixtures
        // Suppress arrow in any direction where a fixture is already sitting adjacent
        const occupied = (dir: Direction): boolean => allFixtures.some(f => {
          if (f.id === fixture.id) return false
          switch (dir) {
            case 'right': return Math.abs(f.x - (fixture.x + fixture.width)) < ATOL && Math.abs(f.y - fixture.y) < ATOL && Math.abs(f.height - fixture.height) < ATOL
            case 'left':  return Math.abs(f.x + f.width - fixture.x) < ATOL && Math.abs(f.y - fixture.y) < ATOL && Math.abs(f.height - fixture.height) < ATOL
            case 'down':  return Math.abs(f.y - (fixture.y + fixture.height)) < ATOL && Math.abs(f.x - fixture.x) < ATOL && Math.abs(f.width - fixture.width) < ATOL
            case 'up':    return Math.abs(f.y + f.height - fixture.y) < ATOL && Math.abs(f.x - fixture.x) < ATOL && Math.abs(f.width - fixture.width) < ATOL
            default: return false
          }
        })
        const dirs: Direction[] = (['up', 'right', 'down', 'left'] as Direction[]).filter(d => !occupied(d))
        return dirs.map(dir => {
          const rotation = dir === 'up' ? 0 : dir === 'right' ? 90 : dir === 'down' ? 180 : 270
          let acx: number, acy: number
          switch (dir) {
            case 'right': acx = pw + ARROW_GAP_PX + rad; acy = ph / 2; break
            case 'left':  acx = -ARROW_GAP_PX - rad;     acy = ph / 2; break
            case 'down':  acx = pw / 2; acy = ph + ARROW_GAP_PX + rad; break
            default:      acx = pw / 2; acy = -ARROW_GAP_PX - rad; break // up
          }
          return (
            <Shape
              key={`arrow-${dir}`}
              x={acx}
              y={acy}
              rotation={rotation}
              listening={true}
              sceneFunc={(ctx) => {
                ctx.beginPath()
                ctx.moveTo(0, -rad)
                ctx.lineTo( rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
                ctx.lineTo(-rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
                ctx.closePath()
                ;(ctx as unknown as CanvasRenderingContext2D).fillStyle = ARROW_COLOR
                ctx.fill()
              }}
              hitFunc={(ctx, shape) => {
                const p = rad + ARROW_HIT_PAD
                ctx.beginPath()
                ctx.rect(-p, -p, p * 2, p * 2)
                ctx.fillStrokeShape(shape)
              }}
              opacity={ARROW_OPACITY}
              onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => { e.cancelBubble = true }}
              onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
                e.cancelBubble = true
                extendChain(fixture.id, dir)
              }}
              onTap={(e: Konva.KonvaEventObject<MouseEvent>) => {
                e.cancelBubble = true
                extendChain(fixture.id, dir)
              }}
            />
          )
        })
      })()}
    </Group>
  )
}

// ─── ChainGroup ──────────────────────────────────────────────────────────────

/**
 * Renders all chain members inside a single draggable Konva Group so the whole
 * chain moves together in real time. Also renders the tail's extend arrow
 * inside the group so the arrow moves with the chain during drag.
 */
function ChainGroup({ duplicateCodes, multiSet }: { duplicateCodes: Set<string>; multiSet: Set<string> }): React.ReactElement | null {
  const { fixtures, selectedChainAnchor, moveChain, extendChain, linkChains } = useCanvasStore()
  const { pixelsPerUnit, gridSizePx } = useProjectStore()
  const { gridMode } = useUiStore()

  if (!selectedChainAnchor) return null

  const chainMembers = getChainMembers(fixtures, selectedChainAnchor)
  if (chainMembers.length === 0) return null

  const tail = chainMembers[chainMembers.length - 1]
  const byId = new Map(fixtures.map(f => [f.id, f]))

  // Tail arrow spec — only if this is actually a chained tail (has prevId)
  let tailArrowSpec: ReturnType<typeof makeArrow> | null = null
  if (tail.prevId) {
    const prev = byId.get(tail.prevId)
    if (prev) {
      const chainDir: Direction = deriveDirection(prev, tail)
      const tpx = tail.x * pixelsPerUnit
      const tpy = tail.y * pixelsPerUnit
      const tpw = tail.width  * pixelsPerUnit
      const tph = tail.height * pixelsPerUnit
      const tcx = tpx + tpw / 2
      const tcy = tpy + tph / 2
      tailArrowSpec = makeArrow(tail.id, chainDir, tpx, tpy, tpw, tph, tcx, tcy)
    }
  }

  const dragBoundFunc = useCallback(
    (pos: { x: number; y: number }): { x: number; y: number } => {
      const { zoom, panX, panY } = useUiStore.getState()
      const state = useCanvasStore.getState()
      const chainFixtures = getChainMembers(state.fixtures, selectedChainAnchor)
      if (chainFixtures.length === 0) return pos
      const chainIdSet = new Set(chainFixtures.map(f => f.id))
      const others: AlignBox[] = [...state.fixtures.filter(f => !chainIdSet.has(f.id)), ...state.walls]

      if (gridMode === 'off') {
        // Free drag — align chain bounding box against other fixtures
        const groupOffX = (pos.x - panX) / (zoom * pixelsPerUnit)
        const groupOffY = (pos.y - panY) / (zoom * pixelsPerUnit)
        const bbMinX = Math.min(...chainFixtures.map(f => f.x)) + groupOffX
        const bbMinY = Math.min(...chainFixtures.map(f => f.y)) + groupOffY
        const bbMaxX = Math.max(...chainFixtures.map(f => f.x + f.width))  + groupOffX
        const bbMaxY = Math.max(...chainFixtures.map(f => f.y + f.height)) + groupOffY
        const result = computeAlignmentSnap(bbMinX, bbMinY, bbMaxX - bbMinX, bbMaxY - bbMinY, others, zoom, pixelsPerUnit)
        updateGuides(result.guideY, result.guideX)
        const dxPx = (result.x - bbMinX) * pixelsPerUnit * zoom
        const dyPx = (result.y - bbMinY) * pixelsPerUnit * zoom
        return { x: pos.x + dxPx, y: pos.y + dyPx }
      }

      // Grid snap — try head AND tail as anchors; use whichever snaps closer
      const head = chainFixtures[0]
      const tail = chainFixtures[chainFixtures.length - 1]
      const candidates = head.id === tail.id ? [head] : [head, tail]
      let bestDist = Infinity
      let bestResult = pos

      for (const f of candidates) {
        const fOffsetX = f.x * pixelsPerUnit * zoom
        const fOffsetY = f.y * pixelsPerUnit * zoom
        const snapped = computeSnap(
          fOffsetX + pos.x, fOffsetY + pos.y,
          f.width  * pixelsPerUnit,
          f.height * pixelsPerUnit,
          others, pixelsPerUnit, gridSizePx, zoom, panX, panY
        )
        const dist = Math.hypot(snapped.x - (fOffsetX + pos.x), snapped.y - (fOffsetY + pos.y))
        if (dist < bestDist) {
          bestDist = dist
          bestResult = { x: snapped.x - fOffsetX, y: snapped.y - fOffsetY }
        }
      }

      return bestResult
    },
    [selectedChainAnchor, pixelsPerUnit, gridSizePx, gridMode]
  )

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>): void => {
      updateGuides(null, null)
      const gx = e.target.x()
      const gy = e.target.y()
      e.target.position({ x: 0, y: 0 })
      const dx = gx / pixelsPerUnit
      const dy = gy / pixelsPerUnit
      const state = useCanvasStore.getState()
      const chainFixtures = getChainMembers(state.fixtures, selectedChainAnchor)
      const ids = chainFixtures.map(f => f.id)
      const chainIdSet = new Set(ids)
      const others = state.fixtures.filter(f => !chainIdSet.has(f.id))

      // Block the move if any chain member would land on top of an existing
      // fixture, on a wall, or outside the store's perimeter
      const wouldOverlap = chainFixtures.some(f => {
        const nx = f.x + dx
        const ny = f.y + dy
        return others.some(o =>
          nx < o.x + o.width  - 0.01 && nx + f.width  > o.x + 0.01 &&
          ny < o.y + o.height - 0.01 && ny + f.height > o.y + 0.01
        )
      })
      const invalid = chainFixtures.some(f =>
        hitsWallOrLeavesPerimeter({ x: f.x + dx, y: f.y + dy, width: f.width, height: f.height })
      )
      if (wouldOverlap || invalid) return  // group already reset to 0,0; store unchanged

      moveChain(ids, dx, dy)

      // Grid off: no auto-linking — user placed it freely
      if (gridMode === 'off') return

      // After moving, check if chain ends landed adjacent to another chain's open end → link
      const TOL = 0.15
      const updated = useCanvasStore.getState()
      const updatedChain = getChainMembers(updated.fixtures, selectedChainAnchor)
      const chainHead = updatedChain[0]
      const chainTail = updatedChain[updatedChain.length - 1]
      const updatedOthers = updated.fixtures.filter(f => !chainIdSet.has(f.id))

      // Tail → adjacent open head
      if (!chainTail.nextId) {
        const secondToLast = updatedChain.length >= 2 ? updatedChain[updatedChain.length - 2] : null
        const tailDir = secondToLast ? deriveDirection(secondToLast, chainTail) : null

        for (const other of updatedOthers) {
          if (other.prevId) continue
          let matches = false
          if (!tailDir) {
            // Single-member chain — all directions
            matches =
              (Math.abs((chainTail.x + chainTail.width) - other.x) < TOL && Math.abs(chainTail.y - other.y) < TOL && Math.abs(chainTail.height - other.height) < TOL) ||
              (Math.abs((chainTail.y + chainTail.height) - other.y) < TOL && Math.abs(chainTail.x - other.x) < TOL && Math.abs(chainTail.width - other.width) < TOL)
          } else {
            switch (tailDir) {
              case 'right': matches = Math.abs((chainTail.x + chainTail.width) - other.x) < TOL && Math.abs(chainTail.y - other.y) < TOL && Math.abs(chainTail.height - other.height) < TOL; break
              case 'left':  matches = Math.abs(other.x + other.width - chainTail.x) < TOL && Math.abs(chainTail.y - other.y) < TOL && Math.abs(chainTail.height - other.height) < TOL; break
              case 'down':  matches = Math.abs((chainTail.y + chainTail.height) - other.y) < TOL && Math.abs(chainTail.x - other.x) < TOL && Math.abs(chainTail.width - other.width) < TOL; break
              case 'up':    matches = Math.abs(other.y + other.height - chainTail.y) < TOL && Math.abs(chainTail.x - other.x) < TOL && Math.abs(chainTail.width - other.width) < TOL; break
            }
          }
          if (matches) { linkChains(chainTail.id, other.id); break }
        }
      }

      // Head → adjacent open tail (opposite of chain direction)
      if (!chainHead.prevId) {
        const second = updatedChain.length >= 2 ? updatedChain[1] : null
        const headChainDir = second ? deriveDirection(chainHead, second) : null

        for (const other of updatedOthers) {
          if (other.nextId) continue
          let matches = false
          if (!headChainDir) {
            matches =
              (Math.abs((other.x + other.width) - chainHead.x) < TOL && Math.abs(other.y - chainHead.y) < TOL && Math.abs(other.height - chainHead.height) < TOL) ||
              (Math.abs((other.y + other.height) - chainHead.y) < TOL && Math.abs(other.x - chainHead.x) < TOL && Math.abs(other.width - chainHead.width) < TOL)
          } else {
            switch (headChainDir) {
              case 'right': matches = Math.abs((other.x + other.width) - chainHead.x) < TOL && Math.abs(other.y - chainHead.y) < TOL && Math.abs(other.height - chainHead.height) < TOL; break
              case 'left':  matches = Math.abs(other.x - (chainHead.x + chainHead.width)) < TOL && Math.abs(other.y - chainHead.y) < TOL && Math.abs(other.height - chainHead.height) < TOL; break
              case 'down':  matches = Math.abs((other.y + other.height) - chainHead.y) < TOL && Math.abs(other.x - chainHead.x) < TOL && Math.abs(other.width - chainHead.width) < TOL; break
              case 'up':    matches = Math.abs(other.y - (chainHead.y + chainHead.height)) < TOL && Math.abs(other.x - chainHead.x) < TOL && Math.abs(other.width - chainHead.width) < TOL; break
            }
          }
          if (matches) { linkChains(other.id, chainHead.id); break }
        }
      }
    },
    [selectedChainAnchor, pixelsPerUnit, moveChain, linkChains, gridMode]
  )

  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const rad = ARROW_RADIUS_PX

  return (
    <Group
      draggable={true}
      dragBoundFunc={dragBoundFunc}
      onDragEnd={handleDragEnd}
    >
      {chainMembers.map(f => (
        <FixtureShape
          key={f.id}
          fixture={f}
          isSelected={false}
          isChainSelected={true}
          isMultiSelected={multiSet.has(f.id)}
          isDuplicate={!!f.locationCode && duplicateCodes.has(f.locationCode)}
          ownDraggable={false}
        />
      ))}

      {/* Tail extend arrow — inside the group so it moves with the chain during drag */}
      {tailArrowSpec && (
        <Shape
          key={`tail-arrow-${tailArrowSpec.fixtureId}-${tailArrowSpec.direction}`}
          x={tailArrowSpec.cx}
          y={tailArrowSpec.cy}
          rotation={tailArrowSpec.rotation}
          listening={true}
          sceneFunc={(ctx) => {
            ctx.beginPath()
            ctx.moveTo(0, -rad)
            ctx.lineTo( rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
            ctx.lineTo(-rad * Math.cos(toRad(210)), -rad * Math.sin(toRad(210)))
            ctx.closePath()
            ;(ctx as unknown as CanvasRenderingContext2D).fillStyle = ARROW_COLOR
            ctx.fill()
          }}
          hitFunc={(ctx, shape) => {
            const p = rad + ARROW_HIT_PAD
            ctx.beginPath()
            ctx.rect(-p, -p, p * 2, p * 2)
            ctx.fillStrokeShape(shape)
          }}
          opacity={ARROW_OPACITY}
          onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true
            extendChain(tailArrowSpec!.fixtureId, tailArrowSpec!.direction)
          }}
          onTap={(e: Konva.KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true
            extendChain(tailArrowSpec!.fixtureId, tailArrowSpec!.direction)
          }}
        />
      )}
    </Group>
  )
}

// ─── MultiSelectGroup ────────────────────────────────────────────────────────

/**
 * Wraps all multi-selected fixtures in a single draggable Group so they move
 * together in real time. No auto-linking on drop — just move + overlap check.
 */
function MultiSelectGroup(): React.ReactElement | null {
  const { fixtures, multiSelectedIds, moveMulti } = useCanvasStore()
  const { pixelsPerUnit, gridSizePx } = useProjectStore()
  const { gridMode } = useUiStore()

  if (multiSelectedIds.length === 0) return null

  const multiSet = new Set(multiSelectedIds)
  const multiFixtures = fixtures.filter(f => multiSet.has(f.id))
  if (multiFixtures.length === 0) return null

  const codes = fixtures.map(f => f.locationCode).filter(Boolean) as string[]
  const duplicateCodes = new Set(codes.filter((c, i) => codes.indexOf(c) !== i))

  // Use the first fixture as the snap anchor for the whole group
  const anchor = multiFixtures[0]

  const dragBoundFunc = useCallback(
    (pos: { x: number; y: number }): { x: number; y: number } => {
      if (gridMode === 'off') return pos
      const { zoom, panX, panY } = useUiStore.getState()
      const state = useCanvasStore.getState()
      const others: AlignBox[] = [...state.fixtures.filter(f => !multiSet.has(f.id)), ...state.walls]
      const anchorOffsetX = anchor.x * pixelsPerUnit * zoom
      const anchorOffsetY = anchor.y * pixelsPerUnit * zoom
      const snapped = computeSnap(
        anchorOffsetX + pos.x,
        anchorOffsetY + pos.y,
        anchor.width  * pixelsPerUnit,
        anchor.height * pixelsPerUnit,
        others, pixelsPerUnit, gridSizePx, zoom, panX, panY
      )
      return { x: snapped.x - anchorOffsetX, y: snapped.y - anchorOffsetY }
    },
    [multiSelectedIds, pixelsPerUnit, gridSizePx, gridMode]
  )

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>): void => {
      const gx = e.target.x()
      const gy = e.target.y()
      e.target.position({ x: 0, y: 0 })
      const dx = gx / pixelsPerUnit
      const dy = gy / pixelsPerUnit

      const state = useCanvasStore.getState()
      const mSet = new Set(multiSelectedIds)
      const currentMulti = state.fixtures.filter(f => mSet.has(f.id))
      const others       = state.fixtures.filter(f => !mSet.has(f.id))

      const wouldOverlap = currentMulti.some(f => {
        const nx = f.x + dx
        const ny = f.y + dy
        return others.some(o =>
          nx < o.x + o.width  - 0.01 && nx + f.width  > o.x + 0.01 &&
          ny < o.y + o.height - 0.01 && ny + f.height > o.y + 0.01
        )
      })
      const invalid = currentMulti.some(f =>
        hitsWallOrLeavesPerimeter({ x: f.x + dx, y: f.y + dy, width: f.width, height: f.height })
      )
      if (wouldOverlap || invalid) return

      moveMulti(multiSelectedIds, dx, dy)
    },
    [multiSelectedIds, pixelsPerUnit, moveMulti]
  )

  return (
    <Group draggable={true} dragBoundFunc={dragBoundFunc} onDragEnd={handleDragEnd}>
      {multiFixtures.map(f => (
        <FixtureShape
          key={f.id}
          fixture={f}
          isSelected={false}
          isChainSelected={false}
          isMultiSelected={true}
          isDuplicate={!!f.locationCode && duplicateCodes.has(f.locationCode)}
          ownDraggable={false}
        />
      ))}
    </Group>
  )
}

// ─── FixtureLayer (export) ───────────────────────────────────────────────────

export default function FixtureLayer(): React.ReactElement {
  const { fixtures, selectedFixtureId, selectedChainAnchor, multiSelectedIds } = useCanvasStore()

  const codes = fixtures.map((f) => f.locationCode).filter(Boolean) as string[]
  const duplicateCodes = new Set(codes.filter((c, i) => codes.indexOf(c) !== i))
  const multiSet = new Set(multiSelectedIds)

  const chainSelectedIds = new Set<string>()
  if (selectedChainAnchor) {
    getChainMembers(fixtures, selectedChainAnchor).forEach(f => chainSelectedIds.add(f.id))
  }

  return (
    <>
      <Layer>
        {fixtures
          .filter(f => !chainSelectedIds.has(f.id) && !multiSet.has(f.id))
          .map(f => (
            <FixtureShape
              key={f.id}
              fixture={f}
              isSelected={f.id === selectedFixtureId}
              isChainSelected={false}
              isMultiSelected={false}
              isDuplicate={!!f.locationCode && duplicateCodes.has(f.locationCode)}
            />
          ))
        }
        {selectedChainAnchor && <ChainGroup duplicateCodes={duplicateCodes} multiSet={multiSet} />}
        {multiSelectedIds.length > 0 && <MultiSelectGroup />}
      </Layer>
      {/* Alignment guide lines — updated directly via refs, no React re-renders during drag */}
      <Layer listening={false}>
        <Line
          ref={r => { _guideRefs.h = r }}
          visible={false}
          stroke="#22c55e"
          strokeWidth={1}
          points={[0, 0, 1, 0]}
        />
        <Line
          ref={r => { _guideRefs.v = r }}
          visible={false}
          stroke="#22c55e"
          strokeWidth={1}
          points={[0, 0, 0, 1]}
        />
      </Layer>
    </>
  )
}
