import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mqttEvents } from '../services/mqttEvents'
import { robotMqtt } from '../services/mqtt'

// Tests unitaires des handlers mapping de mqtt.ts.
// On appelle les methodes privees via (robotMqtt as any) pour eviter de
// mocker tout le broker.

describe('mqtt mapping handlers', () => {
  beforeEach(() => mqttEvents.removeAllListeners())

  it('handleMap emet map_update avec png + meta combines', () => {
    const events: unknown[] = []
    mqttEvents.on('map_update', (e) => events.push(e))
    const meta = {
      schemaVersion: 1,
      messageId: 'm-1',
      timestamp: '2026-05-22T15:00:00Z',
      width: 4,
      height: 3,
      resolution: 0.05,
      originX: -1,
      originY: -2,
      stamp: 123.45,
    }
    ;(robotMqtt as any).handleMapMeta(1, meta)
    ;(robotMqtt as any).handleMap(1, Buffer.from('FAKEPNG'))
    expect(events.length).toBe(1)
    const e = events[0] as any
    expect(e.robotId).toBe(1)
    expect(e.png.toString()).toBe('FAKEPNG')
    expect(e.meta.width).toBe(4)
    expect(e.meta.resolution).toBeCloseTo(0.05)
  })

  it('handleMappingState emet mapping_state valide', () => {
    const events: unknown[] = []
    mqttEvents.on('mapping_state', (e) => events.push(e))
    ;(robotMqtt as any).handleMappingState(1, {
      schemaVersion: 1,
      messageId: 'm-2',
      timestamp: '2026-05-22T15:00:01Z',
      state: 'RUNNING',
      sessionId: null,
      startedAt: 1234,
    })
    expect(events.length).toBe(1)
    expect((events[0] as any).state).toBe('RUNNING')
  })

  it('rejette mapping_state avec state inconnu', () => {
    const events: unknown[] = []
    mqttEvents.on('mapping_state', (e) => events.push(e))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(robotMqtt as any).handleMappingState(1, { state: 'BOGUS', sessionId: null })
    expect(events.length).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('handleScan emet scan_update', () => {
    const events: unknown[] = []
    mqttEvents.on('scan_update', (e) => events.push(e))
    ;(robotMqtt as any).handleScan(2, {
      ranges: [0.5, 0.7, 1.2],
      angleMin: -1.57,
      angleIncrement: 0.01,
      frameId: 'base_scan',
    })
    expect(events.length).toBe(1)
    expect((events[0] as any).ranges).toHaveLength(3)
  })
})
