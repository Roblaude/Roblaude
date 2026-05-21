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
  prismaMock: {
    mission: { update: vi.fn().mockResolvedValue({}) },
    robot: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // $transaction recoit un tableau de promesses Prisma et resout dans l'ordre.
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}))
vi.mock('../lib/prisma', () => ({ default: prismaMock }))

import { robotMqtt } from '../services/mqtt'

// Helper : reconstruit un message MQTT comme s'il venait du broker.
// Ajoute schemaVersion + timestamp par defaut (spec §4 — obligatoires).
function deliver(topic: string, body: object) {
  const payload = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    ...body,
  }))
  messageHandler!(topic, payload)
}

describe('RobotMqttAdapter — transport', () => {
  beforeEach(() => {
    fakeClient.publish.mockClear()
    fakeClient.subscribe.mockClear()
    robotMqtt.disconnect(); robotMqtt.resetSeenMessageIds()
  })

  it('publishCommand retourne false si pas connecte', () => {
    expect(robotMqtt.publishCommand(1, 'mission', { missionId: 42 })).toBe(false)
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
    robotMqtt.disconnect(); robotMqtt.resetSeenMessageIds()
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

  it('mission/ack rejected SANS reason est rejete par le schema (spec §5.4)', async () => {
    deliver('roblaude/3/mission/ack', {
      messageId: 'm-3',
      missionId: 7,
      result: 'rejected',
      // pas de reason -> doit etre rejete
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).not.toHaveBeenCalled()
  })

  it('mission/ack ignore les messageId deja vus (idempotence)', async () => {
    const payload = { messageId: 'm-dup', missionId: 42, result: 'accepted' as const }
    deliver('roblaude/3/mission/ack', payload)
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(1)
  })

  it('mission/ack — un messageId expire est re-traite (TTL 1h)', async () => {
    // On avance Date.now de 2h pour simuler l'expiration
    const realNow = Date.now
    Date.now = () => realNow.call(Date)

    const payload = { messageId: 'm-old', missionId: 42, result: 'accepted' as const }
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(1)

    // 2h plus tard, le robot rejoue le meme messageId (cas peu probable mais
    // notre TTL doit le laisser passer comme un nouveau message)
    Date.now = () => realNow.call(Date) + 2 * 60 * 60 * 1000
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(2)

    Date.now = realNow
  })

  it('mission/ack — un echec Prisma ne consomme pas le messageId (retry OK)', async () => {
    prismaMock.mission.update
      .mockRejectedValueOnce(new Error('DB transitoire'))
      .mockResolvedValueOnce({})
    const payload = { messageId: 'm-retry', missionId: 42, result: 'accepted' as const }
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve(); await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(1)
    // Retry du robot avec le meme messageId apres l'echec — doit reessayer
    deliver('roblaude/3/mission/ack', payload)
    await Promise.resolve(); await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledTimes(2)
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

describe('RobotMqttAdapter — handlers mission/result', () => {
  beforeEach(() => {
    prismaMock.mission.update.mockClear()
    prismaMock.robot.update.mockClear()
    prismaMock.$transaction.mockClear()
    robotMqtt.disconnect(); robotMqtt.resetSeenMessageIds()
    robotMqtt.connect()
  })

  it('completed: mission COMPLETED + robot AVAILABLE', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-1',
      missionId: 42,
      result: 'completed',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'COMPLETED' },
    })
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'AVAILABLE' },
    })
  })

  it('failed: mission FAILED + failureReason + robot AVAILABLE', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-2',
      missionId: 42,
      result: 'failed',
      reason: 'navigation-timeout',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'FAILED', failureReason: 'navigation-timeout' },
    })
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'AVAILABLE' },
    })
  })

  it('mission/result failed SANS reason est rejete par le schema (spec §5.4)', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-3',
      missionId: 42,
      result: 'failed',
      // pas de reason -> doit etre rejete
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('cancelled: mission CANCELLED + robot AVAILABLE', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-4',
      missionId: 42,
      result: 'cancelled',
    })
    await Promise.resolve()
    expect(prismaMock.mission.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'CANCELLED' },
    })
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'AVAILABLE' },
    })
  })

  it('mission ET robot mis a jour dans la meme transaction', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-5',
      missionId: 42,
      result: 'completed',
    })
    await Promise.resolve()
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it('mission/result idempotent sur messageId', async () => {
    const payload = { messageId: 'r-dup', missionId: 42, result: 'completed' as const }
    deliver('roblaude/3/mission/result', payload)
    deliver('roblaude/3/mission/result', payload)
    await Promise.resolve()
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it('mission/result malforme est ignore', async () => {
    deliver('roblaude/3/mission/result', { missionId: 42, result: 'completed' }) // pas de messageId
    await Promise.resolve()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('mission/result avec result invalide est ignore', async () => {
    deliver('roblaude/3/mission/result', {
      messageId: 'r-bad',
      missionId: 42,
      result: 'exploded',
    })
    await Promise.resolve()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('RobotMqttAdapter — handlers telemetry/battery, status, connection (T4.2.9)', () => {
  beforeEach(() => {
    prismaMock.robot.update.mockClear()
    prismaMock.robot.updateMany.mockClear()
    robotMqtt.disconnect(); robotMqtt.resetSeenMessageIds()
    robotMqtt.connect()
  })

  it('telemetry/battery met a jour Robot.battery (percent)', async () => {
    deliver('roblaude/3/telemetry/battery', { voltage: 11.7, percent: 67, charging: false })
    await Promise.resolve()
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { battery: 67 },
    })
  })

  it('telemetry/battery avec percent hors borne est ignore', async () => {
    deliver('roblaude/3/telemetry/battery', { percent: 150 })
    await Promise.resolve()
    expect(prismaMock.robot.update).not.toHaveBeenCalled()
  })

  it('status met a jour Robot.status', async () => {
    deliver('roblaude/3/status', { state: 'BUSY' })
    await Promise.resolve()
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'BUSY' },
    })
  })

  it('status avec etat inconnu est ignore', async () => {
    deliver('roblaude/3/status', { state: 'FLYING' })
    await Promise.resolve()
    expect(prismaMock.robot.update).not.toHaveBeenCalled()
  })

  it('connection online:false force Robot.status a OFFLINE', async () => {
    deliver('roblaude/3/connection', { online: false })
    await Promise.resolve()
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'OFFLINE' },
    })
  })

  it('connection online:true restaure AVAILABLE si etait OFFLINE', async () => {
    deliver('roblaude/3/connection', { online: true })
    await Promise.resolve()
    expect(prismaMock.robot.updateMany).toHaveBeenCalledWith({
      where: { id: 3, status: 'OFFLINE' },
      data: { status: 'AVAILABLE' },
    })
  })
})
