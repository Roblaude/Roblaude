import { toast } from 'sonner'
import { useRobotStore } from '@/stores/robotStore'
import { useMissionStore } from '@/stores/missionStore'

// Singleton client WebSocket. Une seule connexion pour toute l'app.
// A demarrer apres login (App.tsx) via wsClient.connect(token).
// Dispatche les events broadcast par le backend directement dans les stores
// Zustand — les composants n'ont pas a y toucher.

type WsEvent =
  | { type: 'battery_update'; robotId: number; percent: number }
  | { type: 'status_change'; robotId: number; status: string }
  | { type: 'robot_online'; robotId: number }
  | { type: 'robot_offline'; robotId: number }
  | { type: 'position_update'; robotId: number; x: number; y: number; theta?: number }
  | { type: 'mission_update'; missionId: number; status: string; progress?: number }
  | { type: 'mission_completed'; missionId: number; result: string; reason?: string }

class WsClient {
  private ws: WebSocket | null = null
  private token: string | null = null
  private retryCount = 0
  private cancelled = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  connect(token: string): void {
    if (this.ws && this.token === token) return // deja connecte
    this.disconnect()
    this.token = token
    this.cancelled = false
    this.open()
  }

  disconnect(): void {
    this.cancelled = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = null
    this.token = null
  }

  private open(): void {
    if (this.cancelled || !this.token) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(this.token)}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.retryCount = 0
      useRobotStore.getState().setConnected(true)
    }

    ws.onclose = () => {
      useRobotStore.getState().setConnected(false)
      if (this.cancelled) return
      // backoff exponentiel : 1, 2, 4, 8... cap a 30s
      const delay = Math.min(30000, 1000 * 2 ** this.retryCount)
      this.retryCount++
      this.retryTimer = setTimeout(() => this.open(), delay)
    }

    ws.onerror = () => {
      // close suivra et declenchera retry
    }

    ws.onmessage = (msgEvent) => {
      let evt: WsEvent
      try {
        evt = JSON.parse(msgEvent.data)
      } catch {
        return
      }
      this.dispatch(evt)
    }
  }

  private dispatch(evt: WsEvent): void {
    const robot = useRobotStore.getState()
    const missions = useMissionStore.getState()
    switch (evt.type) {
      case 'battery_update':
        robot.setBatteryLevel(evt.percent)
        break
      case 'status_change':
        robot.setStatus(evt.status as 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ERROR')
        break
      case 'robot_online':
        robot.setStatus('AVAILABLE')
        toast.success('Robot en ligne')
        break
      case 'robot_offline':
        robot.setStatus('OFFLINE')
        toast.error('Robot déconnecté')
        break
      case 'position_update':
        robot.setPosition({ x: evt.x, y: evt.y, heading: evt.theta ?? 0 })
        break
      case 'mission_update':
        // refetch la liste — simple et suffisant (liste petite)
        void missions.fetchMissions()
        break
      case 'mission_completed':
        void missions.fetchMissions()
        if (evt.result === 'completed') toast.success(`Mission #${evt.missionId} terminée`)
        else if (evt.result === 'failed') toast.error(`Mission #${evt.missionId} échouée : ${evt.reason ?? '—'}`)
        else if (evt.result === 'cancelled') toast.warning(`Mission #${evt.missionId} annulée`)
        break
    }
  }
}

export const wsClient = new WsClient()
