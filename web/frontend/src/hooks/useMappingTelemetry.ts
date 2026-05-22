import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMappingStore, type MapMeta, type MappingState } from '@/stores/mappingStore'

// Ouvre /ws/robots/:id/telemetry et alimente mappingStore.
// PNG arrive en frame BINARY prefixee d'un byte de type (0x01 = map png),
// + meta JSON envoye en frame texte separee. On recolle dans le store.
// Reconnect auto avec backoff 1/2/4/8s (cap 30s) — comme wsClient legacy.

const TYPE_MAP_PNG = 0x01
const MAX_BACKOFF_MS = 30_000

export function useMappingTelemetry(robotId: number, enabled: boolean): void {
  const token = useAuthStore((s) => s.token)
  const setMapPng = useMappingStore((s) => s.setMapPng)
  const setMapMeta = useMappingStore((s) => s.setMapMeta)
  const setMapping = useMappingStore((s) => s.setMapping)
  const setCoverage = useMappingStore((s) => s.setCoverage)
  const setFailure = useMappingStore((s) => s.setFailure)
  const setWsConnected = useMappingStore((s) => s.setWsConnected)
  const setLastTelemetry = useMappingStore((s) => s.setLastTelemetry)
  const wsRef = useRef<WebSocket | null>(null)
  const cancelledRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !token) return
    cancelledRef.current = false
    retryCountRef.current = 0

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/telemetry?token=${encodeURIComponent(token)}`

    function connect(): void {
      if (cancelledRef.current) return
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
      currentWs = ws

      ws.onopen = () => {
        retryCountRef.current = 0
        setWsConnected(true)
      }

      ws.onclose = () => {
        setWsConnected(false)
        if (currentWs === ws) currentWs = null
        if (cancelledRef.current) return
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retryCountRef.current)
        retryCountRef.current += 1
        retryTimerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // close suivra et declenchera le retry
      }

      ws.onmessage = (e) => {
        setLastTelemetry(Date.now())
        if (e.data instanceof ArrayBuffer) {
          const view = new Uint8Array(e.data)
          if (view.length < 2 || view[0] !== TYPE_MAP_PNG) return
          const png = view.slice(1)
          const blob = new Blob([png], { type: 'image/png' })
          setMapPng(URL.createObjectURL(blob))
          return
        }
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        switch (msg.type) {
          case 'map_meta':
            setMapMeta(msg.meta as MapMeta)
            break
          case 'mapping_state':
            setMapping(msg.state as MappingState, (msg.sessionId as number | null) ?? null)
            if (typeof msg.coveragePercent === 'number') setCoverage(msg.coveragePercent)
            if (typeof msg.failureReason === 'string') setFailure(msg.failureReason)
            else if (msg.state !== 'FAILED') setFailure(null)
            break
          // scan / plan / frontiers : ignores pour MVP demo
        }
      }
    }

    connect()

    return () => {
      cancelledRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
      currentWs = null
      setWsConnected(false)
    }
  }, [robotId, enabled, token, setMapPng, setMapMeta, setMapping, setCoverage, setFailure, setWsConnected, setLastTelemetry])
}

// module-level ref vers le WS courant — utilise par sendTeleop (item teleop UI).
let currentWs: WebSocket | null = null

/** Envoie un message teleop sur le WS courant. Renvoie false si pas connecte. */
export function sendTeleop(lin: number, ang: number): boolean {
  if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return false
  currentWs.send(JSON.stringify({ type: 'teleop', lin, ang }))
  return true
}
