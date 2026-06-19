import { useCallback, useRef, useState } from 'react'

// Petit hook pour rendre un panneau flottant deplacable : on attache
// `onDragStart` a l'entete (poignee), et on positionne le panneau avec `pos`
// (left/top, en position: fixed). Le drag suit le pointeur jusqu'au relachement.
export function useDraggable(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial)
  const start = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  const onDragStart = useCallback((e: React.PointerEvent): void => {
    // on ne demarre pas un drag depuis un bouton (fermer/reduire/plein ecran)
    if ((e.target as HTMLElement).closest('button')) return
    start.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y }

    const onMove = (ev: PointerEvent): void => {
      const s = start.current
      if (!s) return
      // on clamp grossierement dans la fenetre pour ne pas perdre le panneau
      const x = Math.max(0, Math.min(window.innerWidth - 60, s.px + (ev.clientX - s.sx)))
      const y = Math.max(0, Math.min(window.innerHeight - 30, s.py + (ev.clientY - s.sy)))
      setPos({ x, y })
    }
    const onUp = (): void => {
      start.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [pos.x, pos.y])

  return { pos, onDragStart }
}
