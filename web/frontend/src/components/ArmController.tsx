import { useState, useRef, useCallback } from 'react'
import { Bot, Send, RotateCcw, AlertTriangle, Power, PowerOff, Crosshair } from 'lucide-react'
import { toast } from 'sonner'
import { commandArm, commandArmPreset, type ArmCommand, type ArmPresetName } from '@/lib/armApi'

// Controle direct du bras 6-DOF Yahboom M3 Pro.
// joint1..5 : axes du bras (-180..180 degres)
// joint6    : pince (0 = ouverte, 180 = fermee, range pratique 30..180)
// time      : duree mouvement en ms (50..5000)
//
// Comportement : le slider est continu, on POST sur "drop" (mouseup)
// et sur clic "Envoyer". Pas d'auto-send pendant le drag pour eviter
// de spammer le bras avec des commandes contradictoires.

interface Props {
  robotId: number
}

const REST_POSE: ArmCommand = {
  joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 90,
  time: 1000,
}

const SLIDERS = [
  { key: 'joint1', label: 'Base (yaw)', min: -180, max: 180 },
  { key: 'joint2', label: 'Épaule', min: -90, max: 90 },
  { key: 'joint3', label: 'Coude', min: -90, max: 90 },
  { key: 'joint4', label: 'Poignet 1', min: -90, max: 90 },
  { key: 'joint5', label: 'Poignet 2', min: -180, max: 180 },
  { key: 'joint6', label: '🤖 Pince', min: 0, max: 180 },
] as const

export function ArmController({ robotId }: Props) {
  const [pose, setPose] = useState<ArmCommand>(REST_POSE)
  const [timeMs, setTimeMs] = useState(1500)  // 1.5s par defaut, mouvement doux
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)  // safety toggle
  const lastSentRef = useRef<number>(0)

  const send = useCallback(async (cmd: ArmCommand): Promise<void> => {
    if (!armed) {
      toast.warning('Active "ARMÉ" pour envoyer la commande au vrai bras')
      return
    }
    // throttle 100ms cote client (evite de spammer si plusieurs sliders bougent)
    const now = Date.now()
    if (now - lastSentRef.current < 100) return
    lastSentRef.current = now
    setBusy(true)
    try {
      await commandArm(robotId, { ...cmd, time: timeMs })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur cmd arm')
    } finally {
      setBusy(false)
    }
  }, [robotId, timeMs, armed])

  const onSliderChange = (key: keyof ArmCommand, value: number): void => {
    setPose((p) => ({ ...p, [key]: value }))
  }

  const onSliderRelease = (): void => {
    void send(pose)
  }

  const resetPose = (): void => {
    setPose(REST_POSE)
    void send(REST_POSE)
  }

  const applyPreset = useCallback(async (preset: ArmPresetName): Promise<void> => {
    if (!armed) {
      toast.warning('Active "ARMÉ" pour appliquer un preset au vrai bras')
      return
    }
    setBusy(true)
    try {
      const sent = await commandArmPreset(robotId, preset)
      // sync l'UI avec ce qu'on a envoye (sauf time, le slider ne le gere pas)
      setPose({
        joint1: sent.joint1, joint2: sent.joint2, joint3: sent.joint3,
        joint4: sent.joint4, joint5: sent.joint5, joint6: sent.joint6,
      })
      const label = preset === 'startup' ? 'Démarrage' : preset === 'shutdown' ? 'Rangement' : 'Vertical (référence)'
      toast.success(`Preset "${label}" envoyé`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `erreur preset ${preset}`)
    } finally {
      setBusy(false)
    }
  }, [armed, robotId])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Bras (6-DOF)</h2>
        </div>
        <button
          onClick={() => setArmed((a) => !a)}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            armed
              ? 'bg-red-600 border-red-400 text-white animate-pulse'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
          aria-pressed={armed}
        >
          {armed ? '● ARMÉ' : '○ Désarmé'}
        </button>
      </div>

      {!armed && (
        <div className="flex items-start gap-1.5 text-[11px] text-yellow-500 bg-yellow-900/20 border border-yellow-800/40 rounded p-1.5 mb-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Mode test : les drags ne sont PAS envoyés au robot tant que "Désarmé".</span>
        </div>
      )}

      <div className="space-y-2 mb-3">
        {SLIDERS.map(({ key, label, min, max }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-0.5">
              <label htmlFor={`arm-${key}`}>{label}</label>
              <span className="font-mono text-gray-200">{pose[key]}°</span>
            </div>
            <input
              id={`arm-${key}`}
              type="range"
              min={min}
              max={max}
              value={pose[key] ?? 0}
              onChange={(e) => onSliderChange(key, Number(e.target.value))}
              onPointerUp={onSliderRelease}
              onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onSliderRelease() }}
              className="w-full h-1.5 bg-gray-800 rounded appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-[11px] text-gray-400">Durée (ms)</label>
        <input
          type="number"
          min={50}
          max={5000}
          step={50}
          value={timeMs}
          onChange={(e) => setTimeMs(Math.max(50, Math.min(5000, Number(e.target.value))))}
          className="w-20 bg-black border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
        />
      </div>

      <div className="flex gap-2 mb-2">
        <button
          onClick={() => void send(pose)}
          disabled={busy || !armed}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs rounded font-medium"
        >
          <Send className="w-3 h-3" /> Envoyer pose
        </button>
        <button
          onClick={resetPose}
          disabled={busy || !armed}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 text-xs rounded font-medium"
          title="Pose repos manuelle : tous joints à 0, pince à 90"
        >
          <RotateCcw className="w-3 h-3" /> Repos
        </button>
      </div>

      {/* Presets pre-configures. Convention angulaire non encore validee :
          l'utilisateur doit confirmer les valeurs par essai et eventuellement
          enregistrer ses propres poses via le store local (todo). */}
      <div className="border-t border-gray-800 pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
            Poses prédéfinies
          </div>
          <span className="text-[9px] text-yellow-500">non calibrées</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => void applyPreset('startup')}
            disabled={busy || !armed}
            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[10px] rounded font-medium"
            title="Pose au démarrage : bras prêt à travailler (légèrement plié vers l'avant)"
          >
            <Power className="w-3 h-3" /> Démarrage
          </button>
          <button
            onClick={() => void applyPreset('vertical')}
            disabled={busy || !armed}
            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[10px] rounded font-medium"
            title="Référence physique : bras tout droit vertical comme un pic"
          >
            <Crosshair className="w-3 h-3" /> Vertical
          </button>
          <button
            onClick={() => void applyPreset('shutdown')}
            disabled={busy || !armed}
            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[10px] rounded font-medium"
            title="Pose au rangement : bras replié sur lui-même, pince fermée"
          >
            <PowerOff className="w-3 h-3" /> Rangement
          </button>
        </div>
      </div>
    </div>
  )
}
