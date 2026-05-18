import { useRobotStore } from '../stores/robotStore'
import { Square } from 'lucide-react'

interface Props {
  compact?: boolean
}

export function StopButton({ compact = false }: Props) {
  const { status, setStatus } = useRobotStore()
  const isActive = status !== 'OFFLINE'

  function handleStop() {
    if (isActive) setStatus('OFFLINE')
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
