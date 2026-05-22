import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import { wsRouter } from '../services/wsRouter'
import { wsTf } from '../services/wsTf'
import { mqttEvents } from '../services/mqttEvents'
import { getJwtSecret } from '../middleware/auth'

let server: http.Server
let port: number
let token: string
const openSockets: WebSocket[] = []

beforeAll(async () => {
  server = http.createServer((_req, res) => res.end('ok'))
  wsRouter.attach(server)
  wsTf.register()
  await new Promise<void>((r) => server.listen(0, () => r()))
  port = (server.address() as { port: number }).port
  token = jwt.sign({ userId: 1 }, getJwtSecret(), { expiresIn: '5m' })
})

afterAll(() => {
  while (openSockets.length) openSockets.pop()?.close()
  wsTf.close()
  server.close()
})

describe('wsTf', () => {
  it('relaye tf_update vers le client connecte au bon robot', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/robots/1/tf?token=${token}`)
    openSockets.push(ws)
    await new Promise((r) => ws.on('open', () => r(undefined)))
    const received: unknown[] = []
    ws.on('message', (d) => received.push(JSON.parse(d.toString())))
    mqttEvents.emit('tf_update', {
      robotId: 1,
      frames: [
        { id: 'base_link', parent: 'odom', x: 1, y: 2, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      ],
    })
    await new Promise((r) => setTimeout(r, 50))
    const snap = received.find((m) => (m as { type: string }).type === 'tf_snapshot')
    expect(snap).toBeDefined()
    expect((snap as { frames: { id: string }[] }).frames[0].id).toBe('base_link')
  })

  it('isole les rooms par robotId', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/robots/2/tf?token=${token}`)
    openSockets.push(ws)
    await new Promise((r) => ws.on('open', () => r(undefined)))
    const received: unknown[] = []
    ws.on('message', (d) => received.push(JSON.parse(d.toString())))
    // emit pour robot 1, le client robot 2 ne doit RIEN recevoir
    mqttEvents.emit('tf_update', { robotId: 1, frames: [] })
    await new Promise((r) => setTimeout(r, 50))
    expect(received.length).toBe(0)
  })
})
