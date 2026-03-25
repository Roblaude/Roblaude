import { useRobotStore } from '../stores/robotStore'

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
        className="w-12 h-12 rounded-full bg-red-500 text-white font-bold text-lg shadow-lg
                   disabled:opacity-40 disabled:cursor-not-allowed
                   active:scale-95 transition-transform"
      >
        ■
      </button>
    )
  }

  return (
    <button
      onClick={handleStop}
      aria-label="Arrêt d'urgence du robot"
      disabled={!isActive}
      className="w-full py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold
                 tracking-widest shadow-md disabled:opacity-40 disabled:cursor-not-allowed
                 active:scale-95 transition-all"
    >
      STOP
    </button>
  )
}
