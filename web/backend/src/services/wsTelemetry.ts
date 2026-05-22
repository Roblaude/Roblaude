import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { wsRouter } from './wsRouter'
import { mqttEvents } from './mqttEvents'
import { robotMqtt } from './mqtt'

// WS endpoint /ws/robots/:id/telemetry (T3.5.6).
// Groupe les clients par robotId (room). Chaque event mqtt mapping est
// broadcaste a la room concernee. Un message teleop d'un client est
// forwarde sur MQTT cmd/teleop.
//
// PNG map : frame BINARY prefixee d'un byte de type (0x01) + meta JSON
// envoye en frame texte separee (le frontend doit recoller les deux).

type Room = Set<WebSocket>

const TYPE_MAP_PNG = 0x01

class WsTelemetry {
  private wss: WebSocketServer | null = null
  private rooms = new Map<number, Room>()

  register(): void {
    if (this.wss) return
    this.wss = new WebSocketServer({ noServer: true })

    wsRouter.register('/ws/robots/:id/telemetry', ({ req, socket, head, params }) => {
      const robotId = Number(params.id)
      if (!Number.isInteger(robotId) || robotId <= 0) {
        socket.destroy()
        return
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.attachClient(robotId, ws)
      })
    })

    mqttEvents.on('map_update', (e) => this.broadcastMap(e.robotId, e.png, e.meta))
    mqttEvents.on('scan_update', (e) => this.broadcastJson(e.robotId, { type: 'scan', ...e }))
    mqttEvents.on('plan_update', (e) => this.broadcastJson(e.robotId, { type: 'plan', poses: e.poses }))
    mqttEvents.on('frontiers_update', (e) => this.broadcastJson(e.robotId, { type: 'frontiers', cells: e.cells }))
    mqttEvents.on('mapping_state', (e) => this.broadcastJson(e.robotId, { type: 'mapping_state', ...e }))
    mqttEvents.on('annotation_change', (e) => this.broadcastJson(e.robotId, {
      type: e.action === 'deleted' ? 'annotation_deleted' : `annotation_${e.action}`,
      annotation: e.annotation,
      id: e.id,
    }))

    console.log('[ws] wsTelemetry registered on /ws/robots/:id/telemetry')
  }

  private attachClient(robotId: number, ws: WebSocket): void {
    let room = this.rooms.get(robotId)
    if (!room) {
      room = new Set()
      this.rooms.set(robotId, room)
    }
    room.add(ws)
    ws.on('message', (data) => this.onClientMessage(robotId, ws, data))
    ws.on('close', () => {
      room!.delete(ws)
      if (room!.size === 0) this.rooms.delete(robotId)
    })
    ws.on('error', () => ws.close())
  }

  private onClientMessage(robotId: number, _ws: WebSocket, data: RawData): void {
    let msg: { type?: string; lin?: unknown; ang?: unknown }
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.type === 'teleop') {
      const lin = Number(msg.lin ?? 0)
      const ang = Number(msg.ang ?? 0)
      if (!Number.isFinite(lin) || !Number.isFinite(ang)) return
      // clamp securite — vitesses brutes refusees (cf. spec §5.5 dead-man)
      const cLin = Math.max(-0.5, Math.min(0.5, lin))
      const cAng = Math.max(-1.0, Math.min(1.0, ang))
      robotMqtt.publishCommand(robotId, 'teleop', { lin: cLin, ang: cAng })
    }
    // type === 'subscribe' / autre : no-op MVP (tous canaux actifs par defaut)
  }

  private broadcastJson(robotId: number, payload: object): void {
    const room = this.rooms.get(robotId)
    if (!room) return
    const data = JSON.stringify(payload)
    for (const ws of room) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    }
  }

  private broadcastMap(
    robotId: number,
    png: Buffer,
    meta: { width: number; height: number; resolution: number; originX: number; originY: number; stamp: number },
  ): void {
    const room = this.rooms.get(robotId)
    if (!room) return
    const header = Buffer.from([TYPE_MAP_PNG])
    const binary = Buffer.concat([header, png])
    const metaMsg = JSON.stringify({ type: 'map_meta', meta })
    for (const ws of room) {
      if (ws.readyState !== WebSocket.OPEN) continue
      ws.send(binary, { binary: true })
      ws.send(metaMsg)
    }
  }

  /** Ferme tous les sockets — utilise au shutdown. */
  close(): void {
    for (const room of this.rooms.values()) {
      for (const ws of room) ws.close()
    }
    this.rooms.clear()
    this.wss?.close()
    this.wss = null
  }
}

export const wsTelemetry = new WsTelemetry()
