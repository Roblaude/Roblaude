import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../lib/api'
import { runRepair, getRobotHealth, REPAIR_LABELS } from '../lib/repairApi'

const mockFetch = vi.mocked(apiFetch)

beforeEach(() => mockFetch.mockReset())

describe('repairApi', () => {
  it('REPAIR_LABELS couvre les actions exposees', () => {
    expect(Object.keys(REPAIR_LABELS).sort()).toEqual([
      'reboot',
      'reconnect_stm32',
      'restart_ros',
      'resync_clock',
      'shutdown',
    ])
  })

  it('runRepair POST la bonne route + body', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, action: 'reconnect_stm32' }) } as Response)
    const r = await runRepair(1, 'reconnect_stm32')
    expect(mockFetch).toHaveBeenCalledWith('/admin/robots/1/repair', {
      method: 'POST',
      body: JSON.stringify({ action: 'reconnect_stm32', confirm: false }),
    })
    expect(r.ok).toBe(true)
  })

  it('reboot passe confirm:true', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, action: 'reboot' }) } as Response)
    await runRepair(1, 'reboot', true)
    expect(mockFetch).toHaveBeenCalledWith('/admin/robots/1/repair', {
      method: 'POST',
      body: JSON.stringify({ action: 'reboot', confirm: true }),
    })
  })

  it('getRobotHealth GET la bonne route', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ reachable: true }) } as Response)
    await getRobotHealth(2)
    expect(mockFetch).toHaveBeenCalledWith('/admin/robots/2/health')
  })

  it('runRepair leve si la reponse est !ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) } as Response)
    await expect(runRepair(1, 'restart_ros')).rejects.toThrow('boom')
  })
})
