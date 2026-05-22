import { useEffect, useState } from 'react'
import { useMappingStore } from '@/stores/mappingStore'

// Renvoie true si on est en RUNNING/STARTING/STOPPING et qu'aucun message
// telemetry n'a ete recu depuis `thresholdMs`. Re-evalue toutes les secondes
// dans un setInterval (l'update setState async satisfait react-hooks/purity
// et react-hooks/set-state-in-effect — Date.now est dans le tick, pas dans
// le render).

const ACTIVE_STATES = new Set(['STARTING', 'RUNNING', 'STOPPING'])

export function useMappingStaleness(thresholdMs = 10_000): boolean {
  const state = useMappingStore((s) => s.state)
  const lastTelemetryAt = useMappingStore((s) => s.lastTelemetryAt)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const compute = (): boolean => {
      if (!ACTIVE_STATES.has(state)) return false
      if (!lastTelemetryAt) return true
      return Date.now() - lastTelemetryAt > thresholdMs
    }
    // Pas de tick initial synchrone (sinon eslint set-state-in-effect).
    // Le premier tick arrive au bout de 1s — acceptable.
    const id = setInterval(() => setStale(compute()), 1000)
    return () => clearInterval(id)
  }, [state, lastTelemetryAt, thresholdMs])

  return stale
}
