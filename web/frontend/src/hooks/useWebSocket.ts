import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { wsClient } from '@/services/websocket'

// Bootstrap du client WS singleton : connecte au mount si on a un token,
// disconnect a l'unmount ou au logout. A monter UNE SEULE FOIS (App.tsx).
export function useWebSocket() {
  const token = useAuthStore((s) => s.token)
  useEffect(() => {
    if (!token) return
    wsClient.connect(token)
    return () => wsClient.disconnect()
  }, [token])
}
