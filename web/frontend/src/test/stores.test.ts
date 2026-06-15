import { describe, it, expect, afterEach, vi } from 'vitest'
import { useThemeStore } from '../stores/themeStore'
import { useAuthStore } from '../stores/authStore'
import { useRobotStore } from '../stores/robotStore'
import { useMissionStore, type Mission } from '../stores/missionStore'

// `global` existe au runtime (jsdom/node) mais pas dans la lib TS DOM
declare const global: { fetch: unknown }

const ok = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: true, status, json: async () => body })

const mkMission = (over: Partial<Mission>): Mission => ({
  id: 0, type: 'TRANSPORT', status: 'PENDING', userId: 1, robotId: null,
  fromPointId: 1, toPointId: 2, objectId: null, failureReason: null,
  graspAttempts: 0, createdAt: '', updatedAt: '', ...over,
})

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ user: null, token: null, error: null, loading: false })
})

describe('themeStore', () => {
  it('toggle et setArcade', () => {
    useThemeStore.setState({ arcade: false })
    useThemeStore.getState().toggleArcade()
    expect(useThemeStore.getState().arcade).toBe(true)
    useThemeStore.getState().setArcade(false)
    expect(useThemeStore.getState().arcade).toBe(false)
  })
})

describe('authStore', () => {
  it('login stocke user + token', async () => {
    global.fetch = ok({ user: { id: 1, email: 'a@x', name: 'A', role: 'USER' }, token: 'tok' })
    await useAuthStore.getState().login('a@x', 'pw')
    expect(useAuthStore.getState().token).toBe('tok')
    expect(useAuthStore.getState().user?.email).toBe('a@x')
  })

  it('login échoué -> error + throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'bad creds' }) })
    await expect(useAuthStore.getState().login('a', 'b')).rejects.toThrow('bad creds')
    expect(useAuthStore.getState().error).toBe('bad creds')
  })

  it('logout vide la session', () => {
    useAuthStore.setState({ user: { id: 1, email: 'a', name: 'A', role: 'USER' }, token: 't' })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('robotStore', () => {
  it('setters', () => {
    useRobotStore.getState().setStatus('BUSY')
    expect(useRobotStore.getState().status).toBe('BUSY')
    useRobotStore.getState().setPosition({ x: 1.5 })
    expect(useRobotStore.getState().position.x).toBe(1.5)
    useRobotStore.getState().setBatteryLevel(42)
    expect(useRobotStore.getState().batteryLevel).toBe(42)
    useRobotStore.getState().setConnected(true)
    expect(useRobotStore.getState().connected).toBe(true)
  })

  it('fetchStatus peuple depuis l API', async () => {
    useAuthStore.setState({ token: 't' })
    global.fetch = ok({ data: { id: 1, name: 'R', status: 'AVAILABLE', battery: 77, positionX: 1, positionY: 2, heading: 0.5 } })
    await useRobotStore.getState().fetchStatus()
    expect(useRobotStore.getState().batteryLevel).toBe(77)
    expect(useRobotStore.getState().connected).toBe(true)
    expect(useRobotStore.getState().status).toBe('AVAILABLE')
  })

  it('fetchStatus gère une erreur réseau', async () => {
    useAuthStore.setState({ token: 't' })
    global.fetch = vi.fn().mockRejectedValue(new Error('down'))
    await useRobotStore.getState().fetchStatus()
    expect(useRobotStore.getState().connected).toBe(false)
  })
})

describe('missionStore', () => {
  afterEach(() => useMissionStore.setState({ missions: [], total: 0 }))

  it('fetchMissions remplit missions + total', async () => {
    useAuthStore.setState({ token: 't' })
    global.fetch = ok({ data: [mkMission({ id: 1 })], total: 1 })
    await useMissionStore.getState().fetchMissions()
    expect(useMissionStore.getState().missions).toHaveLength(1)
    expect(useMissionStore.getState().total).toBe(1)
  })

  it('createMission ajoute en tête de liste', async () => {
    useAuthStore.setState({ token: 't' })
    global.fetch = ok({ data: mkMission({ id: 9 }) })
    const m = await useMissionStore.getState().createMission({ type: 'TRANSPORT', fromPointId: 1, toPointId: 2 })
    expect(m.id).toBe(9)
    expect(useMissionStore.getState().missions[0].id).toBe(9)
  })

  it('cancelMission met à jour le statut local', async () => {
    useMissionStore.setState({ missions: [mkMission({ id: 5, status: 'PENDING' })] })
    global.fetch = ok({ data: mkMission({ id: 5, status: 'CANCELLED' }) })
    await useMissionStore.getState().cancelMission(5)
    expect(useMissionStore.getState().missions.find((m) => m.id === 5)?.status).toBe('CANCELLED')
  })
})
