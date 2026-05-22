import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { wsRouter } from '../services/wsRouter'
import { wsRelay } from '../services/websocket'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../middleware/auth'
import type { AddressInfo } from 'node:net'

let server: http.Server
let port: number

beforeAll(async () => {
  // App minimale pour le handshake
  server = http.createServer((_req, res) => res.end('ok'))
  wsRouter.attach(server)
  wsRelay.register()
  await new Promise<void>((r) => server.listen(0, () => r()))
  port = (server.address() as AddressInfo).port
})

afterAll(() => {
  wsRelay.close()
  server.close()
})

function rawUpgrade(path: string, token: string | null): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': Buffer.from(Array(16).fill(0)).toString('base64'),
    }
    const url = token ? `${path}?token=${token}` : path
    const req = http.request({ host: 'localhost', port, path: url, method: 'GET', headers })
    req.on('upgrade', () => resolve({ status: 101 }))
    req.on('response', (res) => resolve({ status: res.statusCode || 0 }))
    req.on('error', reject)
    req.end()
  })
}

describe('wsRouter', () => {
  it('refuse 401 si pas de token', async () => {
    const r = await rawUpgrade('/ws', null)
    expect(r.status).toBe(401)
  })

  it('accepte un upgrade /ws avec token valide', async () => {
    const token = jwt.sign({ userId: 1 }, getJwtSecret(), { expiresIn: '5m' })
    const r = await rawUpgrade('/ws', token)
    expect(r.status).toBe(101)
  })

  it('refuse 404 sur un path inconnu', async () => {
    const token = jwt.sign({ userId: 1 }, getJwtSecret(), { expiresIn: '5m' })
    const r = await rawUpgrade('/ws/unknown', token)
    expect(r.status).toBe(404)
  })
})
