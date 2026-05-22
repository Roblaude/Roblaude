import { useEffect, useState } from 'react'
import { useMappingStore } from '@/stores/mappingStore'

// Renvoie true si on est en RUNNING/STARTING/STOPPING et qu'aucun message
// telemetry n'a ete recu depuis `thresholdMs`. Re-evalue toutes les secondes.
// Permet d'afficher un badge "perte signal robot" pendant la demo si MQTT lag.

export function useMappingStaleness(thresholdMs = 10_000): boolean {
  const state = useMappingStore((s) => s.state)
  const lastTelemetryAt = useMappingStore((s) => s.lastTelemetryAt)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const activeStates = ['STARTING', 'RUNNING', 'STOPPING']
    if (!activeStates.includes(state)) {
      setStale(false)
      return
    }
    const tick = (): void => {
      if (!lastTelemetryAt) {
        setStale(true)
        return
      }
      setStale(Date.now() - lastTelemetryAt > thresholdMs)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state, lastTelemetryAt, thresholdMs])

  return stale
}
