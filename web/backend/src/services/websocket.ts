import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import { MissionStatus, RobotStatus } from '@prisma/client'
import { wsRouter } from './wsRouter'
import { mqttEvents } from './mqttEvents'

// Service relay : MQTT/Prisma -> WebSocket -> clients frontend.
// Singleton, attache sur le meme HTTP server qu'Express.
// Auth : JWT en query param `?token=...` (impossible de mettre un header
// custom dans le constructeur WebSocket cote navigateur).

// Types stricts : on s'aligne sur les enums Prisma pour eviter qu'un broadcast
// erronne (ex. status_change avec status='WUT') corrompe le store frontend.
export type WsEvent =
  | { type: 'battery_update'; robotId: number; percent: number }
  | { type: 'status_change'; robotId: number; status: RobotStatus }
  | { type: 'robot_online'; robotId: number }
  | { type: 'robot_offline'; robotId: number }
  | { type: 'position_update'; robotId: number; x: number; y: number; theta?: number }
  | { type: 'mission_update'; missionId: number; status: MissionStatus; progress?: number }
  | { type: 'mission_completed'; missionId: number; result: 'completed' | 'failed' | 'cancelled'; reason?: string }
  | { type: 'map_update'; robotId: number; mapData: string }

class WebSocketRelay {
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()

  /** S'enregistre comme handler du path /ws sur le router commun.
   * Aussi : s'abonne aux mqttEvents pour rebroadcaster aux clients. */
  register(): void {
    if (this.wss) return

    this.wss = new WebSocketServer({ noServer: true })

    wsRouter.register('/ws', ({ req, socket, head }) => {
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req)
      })
    })

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.clients.add(ws)
      ws.on('close', () => this.clients.delete(ws))
      ws.on('error', (err) => {
        console.error('[ws] client error :', err.message)
        this.clients.delete(ws)
      })
    })

    // Re-broadcast mqttEvents -> clients /ws
    mqttEvents.on('battery_update', (e) => this.broadcast({ type: 'battery_update', ...e }))
    mqttEvents.on('status_change',  (e) => this.broadcast({ type: 'status_change', ...e }))
    mqttEvents.on('robot_online',   (e) => this.broadcast({ type: 'robot_online', ...e }))
    mqttEvents.on('robot_offline',  (e) => this.broadcast({ type: 'robot_offline', ...e }))
    mqttEvents.on('position_update',(e) => this.broadcast({ type: 'position_update', ...e }))
    mqttEvents.on('mission_update', (e) => this.broadcast({ type: 'mission_update', ...e }))
    mqttEvents.on('mission_completed', (e) => this.broadcast({ type: 'mission_completed', ...e }))

    console.log('[ws] WebSocket relay /ws enregistre')
  }

  /** Diffuse un evenement a tous les clients connectes (qui sont OPEN).
   * Nettoie automatiquement les sockets KO/closed pour eviter une fuite. */
  broadcast(event: WsEvent): void {
    if (!this.wss) return
    const payload = JSON.stringify(event)
    const dead: WebSocket[] = []
    for (const ws of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) {
        dead.push(ws)
        continue
      }
      try {
        ws.send(payload)
      } catch (err) {
        console.warn('[ws] send echoue, drop client :', err instanceof Error ? err.message : err)
        dead.push(ws)
      }
    }
    for (const ws of dead) this.clients.delete(ws)
  }

  /** Nombre de clients connectes — utile pour debug et metrics. */
  get clientCount(): number {
    return this.clients.size
  }

  /** Arret propre — ferme toutes les connexions. */
  close(): void {
    for (const ws of this.clients) {
      try {
        ws.close(1001, 'Server shutdown')
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    this.wss?.close()
    this.wss = null
  }
}

/** Singleton du relay WebSocket. */
export const wsRelay = new WebSocketRelay()
