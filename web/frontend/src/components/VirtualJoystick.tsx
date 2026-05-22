import { useRef, useState, useEffect } from 'react'

// Joystick virtuel touch/pointer. Le knob suit le doigt dans un cercle.
// Au drop, retour au centre. emit (lin, ang) normalises [-1, 1] via onChange.
// onChange est appele a 10Hz tant qu'actif (ou meme rate que pointer move).

interface Props {
  size?: number
  enabled: boolean
  onChange: (lin: number, ang: number) => void
  onRelease?: () => void
}

export function VirtualJoystick({ size = 140, enabled, onChange, onRelease }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const radius = size / 2
  const knobRadius = size / 5

  useEffect(() => {
    if (!pos || !enabled) return
    // tick d'envoi a 10Hz tant que actif (au cas ou pointermove ne fire pas)
    const id = setInterval(() => {
      const lin = -pos.y / radius // axe Y vers le haut = avancer (lin positif)
      const ang = -pos.x / radius // axe X vers la gauche = ang positif
      onChange(
        Math.max(-1, Math.min(1, lin)),
        Math.max(-1, Math.min(1, ang)),
      )
    }, 100)
    return () => clearInterval(id)
  }, [pos, radius, enabled, onChange])

  const computePos = (clientX: number, clientY: number): { x: number; y: number } => {
    const el = ref.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > radius) {
      dx = (dx / dist) * radius
      dy = (dy / dist) * radius
    }
    return { x: dx, y: dy }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!enabled) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setPos(computePos(e.clientX, e.clientY))
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!enabled || !pos) return
    setPos(computePos(e.clientX, e.clientY))
  }

  const stop = (): void => {
    setPos(null)
    onChange(0, 0)
    onRelease?.()
  }

  const offset = pos ?? { x: 0, y: 0 }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={pos ? stop : undefined}
      className={`relative rounded-full ${enabled ? 'bg-gray-800 border-gray-700' : 'bg-gray-900 border-gray-800 opacity-50'} border-2 touch-none select-none cursor-grab active:cursor-grabbing`}
      style={{ width: size, height: size }}
    >
      <div
        className={`absolute rounded-full ${pos ? 'bg-blue-500' : 'bg-gray-600'} border border-gray-400 transition-colors`}
        style={{
          width: knobRadius * 2,
          height: knobRadius * 2,
          left: `calc(50% - ${knobRadius}px + ${offset.x}px)`,
          top: `calc(50% - ${knobRadius}px + ${offset.y}px)`,
        }}
      />
    </div>
  )
}
