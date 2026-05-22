import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMappingStore, type MapMeta, type MappingState } from '@/stores/mappingStore'

// Ouvre /ws/robots/:id/telemetry et alimente mappingStore.
// PNG arrive en frame BINARY prefixee d'un byte de type (0x01 = map png),
// + meta JSON envoye en frame texte separee. On recolle dans le store.

const TYPE_MAP_PNG = 0x01

export function useMappingTelemetry(robotId: number, enabled: boolean): void {
  const token = useAuthStore((s) => s.token)
  const setMapPng = useMappingStore((s) => s.setMapPng)
  const setMapMeta = useMappingStore((s) => s.setMapMeta)
  const setMapping = useMappingStore((s) => s.setMapping)
  const setCoverage = useMappingStore((s) => s.setCoverage)
  const setFailure = useMappingStore((s) => s.setFailure)
  const setWsConnected = useMappingStore((s) => s.setWsConnected)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled || !token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/telemetry?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onerror = () => setWsConnected(false)

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const view = new Uint8Array(e.data)
        if (view.length < 2 || view[0] !== TYPE_MAP_PNG) return
        // strip le byte de type
        const png = view.slice(1)
        const blob = new Blob([png], { type: 'image/png' })
        setMapPng(URL.createObjectURL(blob))
        return
      }
      // frame texte = JSON
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

    return () => {
      ws.close()
      wsRef.current = null
      setWsConnected(false)
    }
  }, [robotId, enabled, token, setMapPng, setMapMeta, setMapping, setCoverage, setFailure, setWsConnected])
}
