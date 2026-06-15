import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'

// Integration : vraie DB (pas de mock prisma), transport MQTT mocke pour
// injecter les messages robot. Verifie la chaine complete creation -> fin.

let messageHandler: ((topic: string, payload: Buffer) => void) | null = null
let connectHandler: (() => void) | null = null
let connectOpts: Record<string, unknown> | null = null

const fakeClient = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  end: vi.fn(),
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'connect') { connectHandler = cb as () => void; cb() }
    if (event === 'message') messageHandler = cb as (topic: string, payload: Buffer) => void
    return fakeClient
  }),
}

vi.mock('mqtt', () => ({
  default: { connect: vi.fn((_url: string, opts: Record<string, unknown>) => { connectOpts = opts; return fakeClient }) },
}))

import { robotMqtt } from '../services/mqtt'
import { missionWatchdog } from '../services/missionWatchdog'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'

const prisma = new PrismaClient()
let token: string
let userId: number
let robotId: number
let fromId: number
let toId: number

function deliver(topic: string, body: object) {
  messageHandler!(topic, Buffer.from(JSON.stringify({ schemaVersion: 1, timestamp: new Date().toISOString(), ...body })))
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `int-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'int', role: Role.USER },
  })
  userId = u.id
  token = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `r-${Date.now()}`, status: 'AVAILABLE' } })
  robotId = r.id
  const a = await prisma.point.create({ data: { name: 'A', slug: `ia-${Date.now()}`, x: 0, y: 0 } })
  const b = await prisma.point.create({ data: { name: 'B', slug: `ib-${Date.now()}`, x: 1, y: 1 } })
  fromId = a.id
  toId = b.id
  robotMqtt.connect()
})

afterEach(() => missionWatchdog.clearAll())

afterAll(async () => {
  robotMqtt.disconnect()
  await prisma.mission.deleteMany({ where: { userId } })
  await prisma.point.deleteMany({ where: { id: { in: [fromId, toId] } } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('chaîne MQTT complète (#103)', () => {
  it('création → ack → status → result : mission COMPLETED + robot libéré', async () => {
    const created = await request(app)
      .post('/api/missions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'TRANSPORT', fromPointId: fromId, toPointId: toId, robotId })
    expect(created.status).toBe(201)
    const missionId = created.body.data.id
    expect(fakeClient.publish).toHaveBeenCalled() // cmd/mission

    // le robot accepte puis s'annonce occupe
    deliver(`roblaude/${robotId}/mission/ack`, { messageId: `ack-${missionId}`, missionId, result: 'accepted' })
    deliver(`roblaude/${robotId}/status`, { state: 'BUSY' })
    await vi.waitFor(async () => {
      const r = await prisma.robot.findUnique({ where: { id: robotId } })
      expect(r?.status).toBe('BUSY')
    }, { timeout: 2000 })

    // progression
    deliver(`roblaude/${robotId}/mission/status`, { missionId, state: 'NAVIGATING_TO_PICKUP', progress: 0.3 })
    await vi.waitFor(async () => {
      const m = await prisma.mission.findUnique({ where: { id: missionId } })
      expect(m?.status).toBe('NAVIGATING_TO_PICKUP')
    }, { timeout: 2000 })

    // fin de mission
    deliver(`roblaude/${robotId}/mission/result`, { messageId: `res-${missionId}`, missionId, result: 'completed' })
    await vi.waitFor(async () => {
      const m = await prisma.mission.findUnique({ where: { id: missionId } })
      const r = await prisma.robot.findUnique({ where: { id: robotId } })
      expect(m?.status).toBe('COMPLETED')
      expect(r?.status).toBe('AVAILABLE')
    }, { timeout: 2000 })
  })
})

describe('reconnexion MQTT (#151)', () => {
  it('configure une reconnexion auto (reconnectPeriod)', () => {
    expect(connectOpts?.reconnectPeriod).toBe(2000)
  })

  it('réabonne aux topics après une reconnexion', () => {
    fakeClient.subscribe.mockClear()
    connectHandler!() // simule l'event "connect" rejoue apres une reconnexion
    expect(fakeClient.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining(['roblaude/+/mission/#', 'roblaude/+/telemetry/#']),
      { qos: 1 },
    )
  })
})
