import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'

// IMPORTANT : mock avant l'import du service (sinon le wrapper SSH reel tente
// d'ouvrir une connexion vers le robot).
vi.mock('../services/sshConnection', () => ({
  runOnce: vi.fn(async () => ({
    stdout: '/map [nav_msgs/msg/OccupancyGrid]\n/scan_multi [sensor_msgs/msg/LaserScan]\n',
    stderr: '',
    code: 0,
  })),
}))

import { wsRouter } from '../services/wsRouter'
import { wsTopics } from '../services/wsTopics'
import { getJwtSecret } from '../middleware/auth'

let server: http.Server
let port: number
let token: string
const openSockets: WebSocket[] = []

beforeAll(async () => {
  server = http.createServer((_req, res) => res.end('ok'))
  wsRouter.attach(server)
  wsTopics.register({ pollIntervalMs: 100 })
  await new Promise<void>((r) => server.listen(0, () => r()))
  port = (server.address() as { port: number }).port
  token = jwt.sign({ userId: 1 }, getJwtSecret(), { expiresIn: '5m' })
})

afterAll(() => {
  while (openSockets.length) openSockets.pop()?.close()
  wsTopics.stop()
  server.close()
})

describe('wsTopics', () => {
  it('publie topics_list apres poll SSH', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/robots/1/topics?token=${token}`)
    openSockets.push(ws)
    await new Promise((r) => ws.on('open', () => r(undefined)))
    const received: unknown[] = []
    ws.on('message', (d) => received.push(JSON.parse(d.toString())))
    // attente > pollIntervalMs (100ms) pour 1 cycle
    await new Promise((r) => setTimeout(r, 300))
    const tl = received.find((m) => (m as { type: string }).type === 'topics_list')
    expect(tl).toBeDefined()
    const topics = (tl as { topics: { name: string; msgType: string }[] }).topics
    expect(topics.find((t) => t.name === '/map')).toBeDefined()
    expect(topics.find((t) => t.name === '/scan_multi')).toBeDefined()
  })
})
