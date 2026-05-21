import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mocks — definis avant l'import du module teste (hoisting vi.mock).
let messageHandler: ((topic: string, payload: Buffer) => void) | null = null

const fakeClient = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  end: vi.fn(),
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'connect') cb()
    if (event === 'message') {
      messageHandler = cb as (topic: string, payload: Buffer) => void
    }
    return fakeClient
  }),
}

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => fakeClient) },
}))

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { mission: { update: vi.fn().mockResolvedValue({}) } },
}))
vi.mock('../lib/prisma', () => ({ default: prismaMock }))

import { robotMqtt } from '../services/mqtt'

// Helper : reconstruit un message MQTT comme s'il venait du broker.
function deliver(topic: string, body: object) {
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, ...body }))
  messageHandler!(topic, payload)
}

describe('RobotMqttAdapter — transport', () => {
  beforeEach(() => {
    fakeClient.publish.mockClear()
    fakeClient.subscribe.mockClear()
    robotMqtt.disconnect()
  })

  it('publishCommand throw si pas connecte', () => {
    expect(() => robotMqtt.publishCommand(1, 'mission', { missionId: 42 }))
      .toThrow(/non connecte/)
  })

  it('s abonne aux topics robot a la connexion', () => {
    robotMqtt.connect()
    expect(fakeClient.subscribe).toHaveBeenCalledWith(
      [
        'roblaude/+/telemetry/#',
        'roblaude/+/status',
        'roblaude/+/mission/#',
        'roblaude/+/connection',
      ],
      { qos: 1 },
    )
  })

  it('publie une commande avec topic et enveloppe corrects', () => {
    robotMqtt.connect()
    robotMqtt.publishCommand(7, 'mission', { missionId: 42, type: 'TRANSPORT' })

    expect(fakeClient.publish).toHaveBeenCalledTimes(1)
    const [topic, payload, opts] = fakeClient.publish.mock.calls[0]
    expect(topic).toBe('roblaude/7/cmd/mission')
    expect(opts).toEqual({ qos: 2, retain: false })

    const body = JSON.parse(payload as string)
    expect(body.schemaVersion).toBe(1)
    expect(body.missionId).toBe(42)
    expect(body.type).toBe('TRANSPORT')
    expect(body.messageId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof body.timestamp).toBe('string')
  })

  it('emergency-stop publie sans missionId', () => {
    robotMqtt.connect()
    robotMqtt.publishCommand(1, 'emergency-stop', { reason: 'user-pressed-stop' })

    const [topic, payload] = fakeClient.publish.mock.calls[0]
    expect(topic).toBe('roblaude/1/cmd/emergency-stop')
    expect(JSON.parse(payload as string).reason).toBe('user-pressed-stop')
  })
})

describe('RobotMqttAdapter — handlers mission/ack & mission/status', () => {
  beforeEach(() => {
    prismaMock.mission.update.mockClear()
    robotMqtt.disconnect()
    robotMqtt.connect()
  })

  it('mission/ack accepted attache le robotId a la mission', async () => {
    deliver('roblaude/3/mission/ack', {
      messageId: 'm-1',
      missionId: 42,
      result: 'accepted',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { robotId: 3 },
    })
  })

  it('mission/ack rejected met le statut a FAILED + failureReason', async () => {
    deliver('roblaude/3/mission/ack', {
      messageId: 'm-2',
      missionId: 42,
      result: 'rejected',
      reason: 'robot-busy',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'FAILED', failureReason: 'robot-busy' },
    })
  })

  it('mission/ack rejected sans reason ecrit "rejected"', async () => {
    deliver('roblaude/3/mission/ack', {
      messageId: 'm-3',
      missionId: 7,
      result: 'rejected',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'FAILED', failureReason: 'rejected' },
    })
  })

  it('mission/ack ignore les messageId deja vus (idempotence)', async () => {
    const payload = { messageId: 'm-dup', missionId: 42, result: 'accepted' as const }
    deliver('roblaude/3/mission/ack', payload)
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(1)
  })

  it('mission/ack malforme est ignore (pas de crash)', async () => {
    deliver('roblaude/3/mission/ack', { missionId: 42 }) // pas de messageId/result
    await Promise.resolve()
    expect(prismaMock.mission.update).not.toHaveBeenCalled()
  })

  it('mission/status met a jour le sous-etat', async () => {
    deliver('roblaude/3/mission/status', {
      missionId: 42,
      state: 'NAVIGATING_TO_PICKUP',
      progress: 0.35,
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'NAVIGATING_TO_PICKUP' },
    })
  })

  it('mission/status avec un state invalide est ignore', async () => {
    deliver('roblaude/3/mission/status', { missionId: 42, state: 'WAT' })
    await Promise.resolve()
    expect(prismaMock.mission.update).not.toHaveBeenCalled()
  })
})
