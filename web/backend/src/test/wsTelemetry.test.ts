import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import { wsRouter } from '../services/wsRouter'
import { wsTelemetry } from '../services/wsTelemetry'
import { mqttEvents } from '../services/mqttEvents'
import { robotMqtt } from '../services/mqtt'
import { getJwtSecret } from '../middleware/auth'

let server: http.Server
let port: number
let token: string
const openSockets: WebSocket[] = []

beforeAll(async () => {
  server = http.createServer((_req, res) => res.end('ok'))
  wsRouter.attach(server)
  wsTelemetry.register()
  await new Promise<void>((r) => server.listen(0, () => r()))
  port = (server.address() as { port: number }).port
  token = jwt.sign({ userId: 1, email: 'x@x', role: 'USER' }, getJwtSecret(), { expiresIn: '5m' })
})

afterAll(() => {
  wsTelemetry.close()
  server.close()
})

beforeEach(() => {
  // mqttEvents est un singleton — nettoyer apres chaque test pour eviter
  // les listeners qui s'accumulent (mais on doit re-register les listeners
  // de wsTelemetry, sinon il devient muet). Le plus simple : ne PAS
  // removeAllListeners ici (wsTelemetry s'est abonne au beforeAll).
})

afterEach(async () => {
  while (openSockets.length) {
    const ws = openSockets.pop()!
    if (ws.readyState === WebSocket.OPEN) ws.close()
  }
  // laisse le temps aux rooms de se vider
  await new Promise((r) => setTimeout(r, 30))
})

function open(robotId: number): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/robots/${robotId}/telemetry?token=${token}`)
    openSockets.push(ws)
    ws.on('open', () => res(ws))
    ws.on('error', rej)
  })
}

describe('wsTelemetry', () => {
  it('isole les events par robotId (un client recoit son robot uniquement)', async () => {
    const ws1 = await open(1)
    const ws2 = await open(2)
    const r1: unknown[] = []
    const r2: unknown[] = []
    ws1.on('message', (d) => r1.push(JSON.parse(d.toString())))
    ws2.on('message', (d) => r2.push(JSON.parse(d.toString())))
    mqttEvents.emit('mapping_state', { robotId: 1, state: 'RUNNING', sessionId: 99 })
    await new Promise((r) => setTimeout(r, 50))
    expect(r1.some((m) => (m as { type: string; state: string }).type === 'mapping_state' && (m as { state: string }).state === 'RUNNING')).toBe(true)
    expect(r2.length).toBe(0)
  })

  it('recoit le PNG map en frame binary + meta JSON compagnon', async () => {
    const ws = await open(1)
    const received: { data: Buffer | string; isBinary: boolean }[] = []
    ws.on('message', (d, isBinary) => received.push({ data: d as Buffer, isBinary }))
    mqttEvents.emit('map_update', {
      robotId: 1,
      png: Buffer.from('FAKEPNG'),
      meta: { width: 4, height: 3, resolution: 0.05, originX: 0, originY: 0, stamp: 0 },
    })
    await new Promise((r) => setTimeout(r, 50))
    const bin = received.find((r) => r.isBinary)
    const metaFrame = received.find((r) => !r.isBinary && JSON.parse((r.data as Buffer).toString()).type === 'map_meta')
    expect(bin).toBeDefined()
    expect((bin!.data as Buffer)[0]).toBe(0x01)
    expect(metaFrame).toBeDefined()
  })

  it('teleop client est forwarde sur MQTT avec clamp', async () => {
    const ws = await open(1)
    const calls: { id: number; action: string; body: unknown }[] = []
    const orig = robotMqtt.publishCommand.bind(robotMqtt)
    robotMqtt.publishCommand = ((id: number, action: string, body: object) => {
      calls.push({ id, action, body })
      return true
    }) as typeof robotMqtt.publishCommand
    try {
      // 2.0 > clamp 0.5 — on verifie que le clamp s'applique
      ws.send(JSON.stringify({ type: 'teleop', lin: 2.0, ang: -3.0 }))
      await new Promise((r) => setTimeout(r, 50))
      expect(calls).toHaveLength(1)
      expect(calls[0].id).toBe(1)
      expect(calls[0].action).toBe('teleop')
      expect(calls[0].body).toEqual({ lin: 0.5, ang: -1.0 })
    } finally {
      robotMqtt.publishCommand = orig
    }
  })

  it('refuse upgrade si token absent (401)', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/robots/1/telemetry`)
    const err = await new Promise<Error>((res) => ws.on('error', res))
    expect(err.message).toMatch(/401|Unexpected/)
  })
})
