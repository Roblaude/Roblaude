import { useState } from 'react'
import { toast } from 'sonner'
import { useMissionStore } from '../stores/missionStore'
import { apiFetch } from '../lib/api'
import { Square } from 'lucide-react'

interface Props {
  compact?: boolean
}

const ACTIVE_MISSION_STATUSES = new Set([
  'PENDING',
  'PAUSED',
  'NAVIGATING_TO_PICKUP',
  'WAITING_FOR_LOAD',
  'NAVIGATING_TO_DESTINATION',
  'DETECTING_OBJECT',
  'GRASPING',
  'TRANSPORTING',
  'DEPOSITING',
])

export function StopButton({ compact = false }: Props) {
  // Volontairement PAS conditionne au statut robot : si le WS decroche en
  // pleine demo, le STOP doit rester cliquable (l'e-stop part en MQTT direct).
  const missions = useMissionStore((s) => s.missions)
  const fetchMissions = useMissionStore((s) => s.fetchMissions)
  const [pending, setPending] = useState(false)
  const isActive = !pending

  async function handleStop() {
    if (pending) return
    setPending(true)
    // pas de window.confirm : en urgence chaque seconde compte, et un stop
    // par erreur se rattrape (la mission est juste annulee)
    let active = missions.find((m) => ACTIVE_MISSION_STATUSES.has(m.status))
    if (!active) {
      // store peut etre vide si on n'a pas visite la page missions
      await fetchMissions().catch(() => undefined)
      active = useMissionStore.getState().missions.find((m) => ACTIVE_MISSION_STATUSES.has(m.status))
    }
    if (!active) {
      toast.info('Aucune mission active à arrêter')
      setPending(false)
      return
    }
    try {
      const res = await apiFetch(`/missions/${active.id}/stop`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'user-pressed-stop' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
        toast.error(`Échec STOP : ${err.error ?? res.statusText}`)
        return
      }
      toast.warning(`Mission #${active.id} stoppée`)
      void fetchMissions()
    } catch (e) {
      toast.error(`Erreur réseau : ${e instanceof Error ? e.message : 'inconnue'}`)
    } finally {
      setPending(false)
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleStop}
        aria-label="Arrêt d'urgence"
        disabled={!isActive}
        className="size-12 -mt-6 rounded-full flex items-center justify-center
                   bg-destructive text-destructive-foreground font-bold shadow-[0_0_24px_rgba(239,68,68,0.5)]
                   ring-4 ring-background
                   disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed
                   active:scale-95 transition-all"
      >
        <Square className="size-5" fill="currentColor" />
      </button>
    )
  }

  return (
    <button
      onClick={handleStop}
      aria-label="Arrêt d'urgence du robot"
      disabled={!isActive}
      className="group relative w-full h-11 rounded-sm overflow-hidden
                 border border-destructive/40 bg-destructive/10 hover:bg-destructive/20
                 text-destructive font-mono text-[12px] uppercase tracking-[0.3em] font-semibold
                 disabled:opacity-40 disabled:cursor-not-allowed
                 active:scale-[0.98] transition-all"
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        <Square className={`size-3.5 ${pending ? 'animate-pulse' : ''}`} fill="currentColor" />
        {pending ? 'Stop en cours…' : 'Stop'}
      </span>
      {isActive && (
        <span
          className="absolute inset-y-0 left-0 w-1/3 bg-destructive/20 blur-lg pointer-events-none progress-sweep"
          aria-hidden
        />
      )}
    </button>
  )
}
