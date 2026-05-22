import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMappingStore } from '@/stores/mappingStore'

// Hook commun pour /ws/robots/:id/tf et /ws/robots/:id/topics.
// Pas de reconnect agressif (ces flux sont auxiliaires) — un seul retry.

function openWs(
  path: string,
  token: string,
  onJson: (msg: Record<string, unknown>) => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${window.location.host}${path}?token=${encodeURIComponent(token)}`
  const ws = new WebSocket(url)
  ws.onmessage = (e) => {
    try {
      onJson(JSON.parse(e.data))
    } catch {
      /* ignore */
    }
  }
  return ws
}

export function useTfStream(robotId: number, enabled: boolean): void {
  const token = useAuthStore((s) => s.token)
  const setTfFrames = useMappingStore((s) => s.setTfFrames)
  useEffect(() => {
    if (!enabled || !token) return
    const ws = openWs(`/ws/robots/${robotId}/tf`, token, (msg) => {
      if (msg.type === 'tf_snapshot') {
        setTfFrames((msg.frames ?? []) as { id: string; parent: string }[])
      }
    })
    return () => ws.close()
  }, [robotId, enabled, token, setTfFrames])
}

export function useTopicsStream(robotId: number, enabled: boolean): void {
  const token = useAuthStore((s) => s.token)
  const setTopics = useMappingStore((s) => s.setTopics)
  useEffect(() => {
    if (!enabled || !token) return
    const ws = openWs(`/ws/robots/${robotId}/topics`, token, (msg) => {
      if (msg.type === 'topics_list') {
        setTopics((msg.topics ?? []) as { name: string; msgType: string }[])
      }
    })
    return () => ws.close()
  }, [robotId, enabled, token, setTopics])
}
