import { WebSocketServer, WebSocket } from 'ws'
import { wsRouter } from './wsRouter'
import { mqttEvents } from './mqttEvents'

// WS endpoint /ws/robots/:id/tf — relaie tf_update du robot vers le frontend
// (vue arborescence des frames map -> odom -> base_link -> ...).

class WsTf {
  private wss: WebSocketServer | null = null
  private rooms = new Map<number, Set<WebSocket>>()

  register(): void {
    if (this.wss) return
    this.wss = new WebSocketServer({ noServer: true })

    wsRouter.register('/ws/robots/:id/tf', ({ req, socket, head, params }) => {
      const robotId = Number(params.id)
      if (!Number.isInteger(robotId) || robotId <= 0) {
        socket.destroy()
        return
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        let room = this.rooms.get(robotId)
        if (!room) {
          room = new Set()
          this.rooms.set(robotId, room)
        }
        room.add(ws)
        ws.on('close', () => {
          room!.delete(ws)
          if (room!.size === 0) this.rooms.delete(robotId)
        })
        ws.on('error', () => ws.close())
      })
    })

    mqttEvents.on('tf_update', (e) => {
      const room = this.rooms.get(e.robotId)
      if (!room) return
      const msg = JSON.stringify({ type: 'tf_snapshot', frames: e.frames })
      for (const ws of room) if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })

    console.log('[ws] wsTf registered on /ws/robots/:id/tf')
  }

  close(): void {
    for (const room of this.rooms.values()) {
      for (const ws of room) ws.close()
    }
    this.rooms.clear()
    this.wss?.close()
    this.wss = null
  }
}

export const wsTf = new WsTf()
