import { WebSocketServer, WebSocket } from 'ws'
import { wsRouter } from './wsRouter'
import { runOnce } from './sshConnection'

// WS endpoint /ws/robots/:id/topics — poll periodique de `ros2 topic list -t`
// sur le robot via SSH, broadcast aux clients connectes.

interface RegisterOpts {
  pollIntervalMs?: number
}

class WsTopics {
  private wss: WebSocketServer | null = null
  private rooms = new Map<number, Set<WebSocket>>()
  private timer: NodeJS.Timeout | null = null
  private pollIntervalMs = 1000

  register(opts: RegisterOpts = {}): void {
    if (this.wss) return
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000
    this.wss = new WebSocketServer({ noServer: true })

    wsRouter.register('/ws/robots/:id/topics', ({ req, socket, head, params }) => {
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

    this.timer = setInterval(() => void this.pollAll(), this.pollIntervalMs)
    console.log('[ws] wsTopics registered on /ws/robots/:id/topics')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    for (const room of this.rooms.values()) {
      for (const ws of room) ws.close()
    }
    this.rooms.clear()
    this.wss?.close()
    this.wss = null
  }

  private async pollAll(): Promise<void> {
    for (const robotId of this.rooms.keys()) {
      try {
        const { stdout } = await runOnce(robotId, 'ros2 topic list -t', 5000)
        const topics = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const m = line.match(/^(\S+)\s+\[(\S+)\]$/)
            return m ? { name: m[1], msgType: m[2] } : null
          })
          .filter((t): t is { name: string; msgType: string } => t !== null)
        const msg = JSON.stringify({ type: 'topics_list', topics })
        const room = this.rooms.get(robotId)
        if (!room) continue
        for (const ws of room) if (ws.readyState === WebSocket.OPEN) ws.send(msg)
      } catch (err) {
        console.warn(`[ws-topics] poll robot=${robotId} echec :`,
          err instanceof Error ? err.message : err)
      }
    }
  }
}

export const wsTopics = new WsTopics()
