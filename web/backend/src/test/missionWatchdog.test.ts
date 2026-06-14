import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    mission: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    robot: { update: vi.fn().mockResolvedValue({}) },
  },
}))
vi.mock('../lib/prisma', () => ({ default: prismaMock }))

import { MissionWatchdog } from '../services/missionWatchdog'

describe('MissionWatchdog (#99)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    prismaMock.mission.updateMany.mockClear().mockResolvedValue({ count: 1 })
    prismaMock.robot.update.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('expire une mission sans progres : FAILED + robot libere', async () => {
    const wd = new MissionWatchdog(1000)
    wd.arm(42, 3)
    expect(wd.pending).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)

    expect(prismaMock.mission.updateMany).toHaveBeenCalledWith({
      where: { id: 42, status: { in: expect.any(Array) } },
      data: { status: 'FAILED', failureReason: 'timeout' },
    })
    expect(prismaMock.robot.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'AVAILABLE' },
    })
    expect(wd.pending).toBe(0)
  })

  it('ne touche a rien si la mission est deja terminee (count 0)', async () => {
    prismaMock.mission.updateMany.mockResolvedValue({ count: 0 })
    const wd = new MissionWatchdog(1000)
    wd.arm(42, 3)
    await vi.advanceTimersByTimeAsync(1000)
    expect(prismaMock.robot.update).not.toHaveBeenCalled()
  })

  it('arm() repousse le timeout a chaque progres', async () => {
    const wd = new MissionWatchdog(1000)
    wd.arm(42, 3)
    await vi.advanceTimersByTimeAsync(600)
    wd.arm(42, 3) // progres -> reset
    await vi.advanceTimersByTimeAsync(600)
    expect(prismaMock.mission.updateMany).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(prismaMock.mission.updateMany).toHaveBeenCalledTimes(1)
  })

  it('clear() annule le timeout', async () => {
    const wd = new MissionWatchdog(1000)
    wd.arm(42, 3)
    wd.clear(42)
    expect(wd.pending).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(prismaMock.mission.updateMany).not.toHaveBeenCalled()
  })
})
