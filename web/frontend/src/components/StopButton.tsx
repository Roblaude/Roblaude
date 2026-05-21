import { useState } from 'react'
import { toast } from 'sonner'
import { useRobotStore } from '../stores/robotStore'
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
  const status = useRobotStore((s) => s.status)
  const missions = useMissionStore((s) => s.missions)
  const fetchMissions = useMissionStore((s) => s.fetchMissions)
  const [pending, setPending] = useState(false)
  const isActive = status !== 'OFFLINE' && !pending

  async function handleStop() {
    if (!isActive) return
    const active = missions.find((m) => ACTIVE_MISSION_STATUSES.has(m.status))
    if (!active) {
      toast.info('Aucune mission active à arrêter')
      return
    }
    if (!window.confirm('Confirmer l\'arrêt d\'urgence du robot ?')) return
    setPending(true)
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
        <Square className="size-3.5" fill="currentColor" />
        Stop
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
