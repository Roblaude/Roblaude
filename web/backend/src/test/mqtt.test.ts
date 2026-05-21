import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock du client mqtt — on capture les appels sans toucher au reseau.
// Doit etre defini avant l'import du module teste.
const fakeClient = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  end: vi.fn(),
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    // On declenche 'connect' immediatement pour pouvoir tester subscribe.
    if (event === 'connect') cb()
    return fakeClient
  }),
}

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => fakeClient) },
}))

import { robotMqtt } from '../services/mqtt'

describe('RobotMqttAdapter', () => {
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
