import { useEffect, useState, useRef } from 'react'
import { Gamepad2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square } from 'lucide-react'
import { sendTeleop } from '@/hooks/useMappingTelemetry'

// Joystick clavier + boutons. Dead-man : on republie {lin,ang} a 10Hz tant
// qu'une touche est tenue. Au keyup -> envoie {0,0} pour stopper.
// Le backend clamp deja (±0.5 / ±1.0) mais on reste prudents cote front.

const SPEED_LIN = 0.2
const SPEED_ANG = 0.5
const TICK_MS = 100

type Key = 'forward' | 'backward' | 'left' | 'right'

const KEY_MAP: Record<string, Key> = {
  ArrowUp: 'forward', w: 'forward', z: 'forward',
  ArrowDown: 'backward', s: 'backward',
  ArrowLeft: 'left', a: 'left', q: 'left',
  ArrowRight: 'right', d: 'right',
}

interface Props {
  enabled: boolean
}

export function TeleopPanel({ enabled }: Props) {
  const [pressed, setPressed] = useState<Set<Key>>(new Set())
  const pressedRef = useRef<Set<Key>>(new Set())

  // sync ref + state pour acces synchrone dans le tick
  const setKeyState = (k: Key, on: boolean): void => {
    pressedRef.current = new Set(pressedRef.current)
    if (on) pressedRef.current.add(k)
    else pressedRef.current.delete(k)
    setPressed(new Set(pressedRef.current))
  }

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const k = KEY_MAP[e.key]
      if (!k) return
      // ne pas bloquer les inputs (textarea/input)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      setKeyState(k, true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      const k = KEY_MAP[e.key]
      if (!k) return
      setKeyState(k, false)
    }
    const onBlur = (): void => {
      // perte de focus = on relache tout (sinon le robot continue)
      pressedRef.current = new Set()
      setPressed(new Set())
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let lastWasZero = true
    const tick = (): void => {
      const p = pressedRef.current
      let lin = 0
      let ang = 0
      if (p.has('forward')) lin += SPEED_LIN
      if (p.has('backward')) lin -= SPEED_LIN
      // attention : 'left' = tourner a gauche => ang positif en ROS REP-103
      if (p.has('left')) ang += SPEED_ANG
      if (p.has('right')) ang -= SPEED_ANG

      const isZero = lin === 0 && ang === 0
      // si on est en stop continu, inutile de spammer le broker
      if (isZero && lastWasZero) return
      sendTeleop(lin, ang)
      lastWasZero = isZero
    }
    const id = setInterval(tick, TICK_MS)
    return () => {
      clearInterval(id)
      // safety : envoie un stop au demontage
      sendTeleop(0, 0)
    }
  }, [enabled])

  const stop = (): void => {
    pressedRef.current = new Set()
    setPressed(new Set())
    sendTeleop(0, 0)
  }

  const btnStyle = (active: boolean): string =>
    `w-12 h-12 flex items-center justify-center rounded border ${
      active
        ? 'bg-blue-600 border-blue-400 text-white'
        : 'bg-gray-800 border-gray-700 text-gray-400'
    } disabled:opacity-40`

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Téléop</h2>
        </div>
        <button
          onClick={stop}
          disabled={!enabled}
          className="text-xs flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded"
        >
          <Square className="w-3 h-3" /> STOP
        </button>
      </div>

      <div className="text-xs text-gray-500 mb-3">
        Touches : ↑ ↓ ← → ou ZQSD / WASD. Active uniquement pendant RUNNING.
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto">
        <div />
        <button
          disabled={!enabled}
          className={btnStyle(pressed.has('forward'))}
          onMouseDown={() => setKeyState('forward', true)}
          onMouseUp={() => setKeyState('forward', false)}
          onMouseLeave={() => setKeyState('forward', false)}
        >
          <ArrowUp className="w-5 h-5" />
        </button>
        <div />

        <button
          disabled={!enabled}
          className={btnStyle(pressed.has('left'))}
          onMouseDown={() => setKeyState('left', true)}
          onMouseUp={() => setKeyState('left', false)}
          onMouseLeave={() => setKeyState('left', false)}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          disabled={!enabled}
          className={btnStyle(pressed.has('backward'))}
          onMouseDown={() => setKeyState('backward', true)}
          onMouseUp={() => setKeyState('backward', false)}
          onMouseLeave={() => setKeyState('backward', false)}
        >
          <ArrowDown className="w-5 h-5" />
        </button>
        <button
          disabled={!enabled}
          className={btnStyle(pressed.has('right'))}
          onMouseDown={() => setKeyState('right', true)}
          onMouseUp={() => setKeyState('right', false)}
          onMouseLeave={() => setKeyState('right', false)}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
