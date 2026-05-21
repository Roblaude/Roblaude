import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import jwt from 'jsonwebtoken'
import { MissionStatus, RobotStatus } from '@prisma/client'
import { getJwtSecret } from '../middleware/auth'

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

  /** Attache le WS server sur l'instance HTTP d'Express (path /ws). */
  attach(httpServer: HttpServer): void {
    if (this.wss) return // singleton

    this.wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (req, socket, head) => {
      // Match strict /ws (pas /wsfoo) — pathname exact
      if (!req.url) return socket.destroy()
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.pathname !== '/ws') return socket.destroy()

      // Auth JWT en query param (limitation browser : pas de header
      // custom au moment de l'open WS). Connu : le token peut apparaitre
      // dans des logs reverse-proxy — durcir TLS + log filtering en prod.
      const token = url.searchParams.get('token')
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      try {
        jwt.verify(token, getJwtSecret())
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

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

    console.log('[ws] WebSocket relay attache sur /ws')
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
