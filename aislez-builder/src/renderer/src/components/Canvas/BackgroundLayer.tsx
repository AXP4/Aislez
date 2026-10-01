import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Layer, Group, Rect, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '../../store/canvasStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { WALL_COLOR } from '../../types'

const HANDLE_HIT_PX = 22
const MIN_SIZE = 0.1  // world units

const round2 = (v: number): number => Math.round(v * 100) / 100

type Corner = 'tl' | 'tr' | 'bl' | 'br'
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']

interface Geom { x: number; y: number; w: number; h: number }
interface LocalRect { x: number; y: number; w: number; h: number }

function cornerOfRect(corner: Corner, r: LocalRect): { x: number; y: number } {
  switch (corner) {
    case 'tl': return { x: r.x,       y: r.y }
    case 'tr': return { x: r.x + r.w, y: r.y }
    case 'bl': return { x: r.x,       y: r.y + r.h }
    case 'br': return { x: r.x + r.w, y: r.y + r.h }
  }
}

/**
 * The resize handles always work in the box's own unrotated axis-aligned
 * rect — rotation never touches x/y/width/height. Only the image's own
 * Konva attrs need to counteract it: pre-swap its width/height for a 90°/270°
 * turn and pivot on its own center (via offsetX/Y) positioned at the box's
 * center, so that after Konva applies `rotation`, the content exactly fills
 * the same invariant box regardless of which way it's turned.
 */
function imageAttrsForBox(r: LocalRect, rotation: number): { x: number; y: number; offsetX: number; offsetY: number; width: number; height: number } {
  const swapped = rotation === 90 || rotation === 270
  const width  = swapped ? r.h : r.w
  const height = swapped ? r.w : r.h
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, offsetX: width / 2, offsetY: height / 2, width, height }
}

/** Loads a data-URL (or any src) into a plain HTMLImageElement for Konva's Image to draw. */
function useHtmlImage(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) { setImg(null); return }
    const el = new window.Image()
    el.onload = () => setImg(el)
    el.src = src
    return () => { el.onload = null }
  }, [src])
  return img
}

// ─── BackgroundLayer ────────────────────────────────────────────────────────
//
// The floorplan reference photo. storeOutline (drawn with real, typed
// measurements) is the source of truth for scale — this image is just
// stretched/moved to match it, never the other way around. Resize is corner-
// only and always preserves the image's own aspect ratio (scaling by the
// diagonal distance from the fixed opposite corner), so a retailer can never
// accidentally warp straight walls in the photo into a different scale
// horizontally vs. vertically. Same direct-Konva-mutation-during-drag pattern
// as WallRect: the outer group stays anchored at its drag-start position for
// the whole resize, only the inner image/handles move; committed once on
// drag end.

export default function BackgroundLayer(): React.ReactElement {
  const settings = useProjectStore((s) => s.settings)
  const ppu = useProjectStore((s) => s.pixelsPerUnit)
  const updateBackgroundImage = useProjectStore((s) => s.updateBackgroundImageWithHistory)
  const zoom = useUiStore((s) => s.zoom)
  const selected = useCanvasStore((s) => s.backgroundImageSelected)
  const selectBackgroundImage = useCanvasStore((s) => s.selectBackgroundImage)

  const bg = settings?.backgroundImage ?? null
  const htmlImage = useHtmlImage(bg?.data)

  const groupRef = useRef<Konva.Group>(null)
  const imageRef = useRef<Konva.Image>(null)
  const handleRefs = useRef<Record<Corner, Konva.Group | null>>({ tl: null, tr: null, bl: null, br: null })
  const resizeStart = useRef<Geom | null>(null)
  const resizeGeom = useRef<Geom | null>(null)

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string): void => {
    const stage = e.target.getStage()
    if (stage) stage.container().style.cursor = cursor
  }

  // ── Move: group drag (no snapping — matched to the outline by eye) ─────────

  const handleGroupDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    if (e.target !== groupRef.current) return  // bubbled from a resize handle
    if (!useCanvasStore.getState().backgroundImageSelected) selectBackgroundImage(true)
  }, [selectBackgroundImage])

  const handleGroupDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    if (e.target !== groupRef.current) return  // bubbled from a resize handle
    const node = e.target
    const wx = round2(node.x() / ppu)
    const wy = round2(node.y() / ppu)
    node.position({ x: wx * ppu, y: wy * ppu })
    updateBackgroundImage({ x: wx, y: wy })
  }, [ppu, updateBackgroundImage])

  // ── Resize: corner handle drag ──────────────────────────────────────────────

  /** Push geometry onto the Konva nodes directly, relative to a FIXED group
   *  origin (the geometry when the resize drag started) — the group itself
   *  never moves mid-resize, only the image and handles inside it do. */
  const applyGeom = useCallback((geom: Geom, origin: { x: number; y: number }): void => {
    const local: LocalRect = {
      x: (geom.x - origin.x) * ppu,
      y: (geom.y - origin.y) * ppu,
      w: geom.w * ppu,
      h: geom.h * ppu
    }
    imageRef.current?.setAttrs(imageAttrsForBox(local, bg?.rotation ?? 0))
    for (const corner of CORNERS) {
      handleRefs.current[corner]?.position(cornerOfRect(corner, local))
    }
    groupRef.current?.getLayer()?.batchDraw()
  }, [ppu, bg?.rotation])

  const handleResizeStart = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    if (!bg) return
    resizeStart.current = { x: bg.x, y: bg.y, w: bg.width, h: bg.height }
    resizeGeom.current = { ...resizeStart.current }
  }, [bg])

  const handleResizeMove = useCallback((corner: Corner, e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    const start = resizeStart.current
    if (!start) return
    const node = e.target as Konva.Group
    // node.x()/y() are relative to the group, whose origin sits fixed at
    // `start` for the whole drag — so world position = start + node/ppu
    const dragWorldX = start.x + node.x() / ppu
    const dragWorldY = start.y + node.y() / ppu

    // Fixed = the opposite corner; raw (unlocked) width/height from fixed to drag position
    const fixed = corner === 'tl' ? { x: start.x + start.w, y: start.y + start.h }
      : corner === 'tr' ? { x: start.x, y: start.y + start.h }
      : corner === 'bl' ? { x: start.x + start.w, y: start.y }
      : { x: start.x, y: start.y }  // br → fixed = tl
    const rawW = Math.abs(dragWorldX - fixed.x)
    const rawH = Math.abs(dragWorldY - fixed.y)

    // Uniform scale from the corner-to-corner diagonal distance — this is what
    // keeps the photo's own proportions locked regardless of drag direction.
    const d0 = Math.hypot(start.w, start.h)
    const d1 = Math.hypot(rawW, rawH)
    const scale = Math.max(d1 / d0, MIN_SIZE / d0)
    const w = round2(start.w * scale)
    const h = round2(start.h * scale)

    const g: Geom = corner === 'tl' ? { x: fixed.x - w, y: fixed.y - h, w, h }
      : corner === 'tr' ? { x: fixed.x,     y: fixed.y - h, w, h }
      : corner === 'bl' ? { x: fixed.x - w, y: fixed.y,     w, h }
      : { x: fixed.x,     y: fixed.y,     w, h }  // br

    resizeGeom.current = g
    applyGeom(g, start)
  }, [ppu, applyGeom])

  const handleResizeEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>): void => {
    e.cancelBubble = true
    const g = resizeGeom.current
    resizeStart.current = null
    resizeGeom.current = null
    if (!g) return
    // Normalize: group moves to the final geometry, image/handles reset to
    // local (0,0) — matches what the next React render will compute.
    groupRef.current?.position({ x: g.x * ppu, y: g.y * ppu })
    applyGeom(g, g)
    updateBackgroundImage({ x: g.x, y: g.y, width: g.w, height: g.h })
  }, [ppu, applyGeom, updateBackgroundImage])

  if (!bg || !htmlImage) return <Layer />

  const locked = bg.locked ?? false
  const px = bg.x * ppu
  const py = bg.y * ppu
  const pw = bg.width * ppu
  const ph = bg.height * ppu
  const hitSize = HANDLE_HIT_PX / zoom

  return (
    <Layer>
      <Group
        ref={groupRef}
        x={px}
        y={py}
        draggable={!locked}
        onDragStart={handleGroupDragStart}
        onDragEnd={handleGroupDragEnd}
        onClick={(e) => { e.cancelBubble = true; selectBackgroundImage(true) }}
        onTap={(e) => { e.cancelBubble = true; selectBackgroundImage(true) }}
      >
        <KonvaImage
          ref={imageRef}
          image={htmlImage}
          {...imageAttrsForBox({ x: 0, y: 0, w: pw, h: ph }, bg.rotation)}
          rotation={bg.rotation}
          opacity={bg.opacity}
          stroke={selected ? (locked ? '#8a8aa0' : '#ffffff') : 'transparent'}
          strokeWidth={selected ? 1.5 / zoom : 0}
          onMouseEnter={(e) => setCursor(e, locked ? 'default' : 'move')}
          onMouseLeave={(e) => setCursor(e, 'default')}
        />
        {selected && !locked && CORNERS.map((corner) => {
          const c = cornerOfRect(corner, { x: 0, y: 0, w: pw, h: ph })
          const cursor = corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize'
          return (
            <Group
              key={corner}
              ref={(n) => { handleRefs.current[corner] = n }}
              x={c.x}
              y={c.y}
              draggable
              onDragStart={handleResizeStart}
              onDragMove={(e) => handleResizeMove(corner, e)}
              onDragEnd={handleResizeEnd}
              onMouseEnter={(e) => setCursor(e, cursor)}
              onMouseLeave={(e) => setCursor(e, 'default')}
            >
              <Rect x={-hitSize / 2} y={-hitSize / 2} width={hitSize} height={hitSize} fill="transparent" />
              <Rect
                x={-hitSize / 4} y={-hitSize / 4} width={hitSize / 2} height={hitSize / 2}
                fill="#ffffff" stroke={WALL_COLOR} strokeWidth={1.5 / zoom} cornerRadius={2 / zoom}
              />
            </Group>
          )
        })}
      </Group>
    </Layer>
  )
}
