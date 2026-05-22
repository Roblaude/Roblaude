import { describe, it, expect, beforeEach } from 'vitest'
import { mqttEvents } from '../services/mqttEvents'

describe('mqttEvents', () => {
  beforeEach(() => mqttEvents.removeAllListeners())

  it('émet un event avec payload typé', () => {
    const seen: unknown[] = []
    mqttEvents.on('battery_update', (e) => seen.push(e))
    mqttEvents.emit('battery_update', { robotId: 1, percent: 75 })
    expect(seen).toEqual([{ robotId: 1, percent: 75 }])
  })

  it('peut avoir plusieurs listeners sur le même event', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    mqttEvents.on('status_change', (e) => a.push(e))
    mqttEvents.on('status_change', (e) => b.push(e))
    mqttEvents.emit('status_change', { robotId: 2, status: 'AVAILABLE' })
    expect(a.length).toBe(1)
    expect(b.length).toBe(1)
  })
})
