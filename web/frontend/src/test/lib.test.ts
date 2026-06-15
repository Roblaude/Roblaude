import { describe, it, expect, afterEach, vi } from 'vitest'
import { worldToPixel, pixelToWorld } from '../lib/mapProjection'
import { recordVisit, getHeatmapCells, clearHeatmap } from '../lib/heatmapAccumulator'
import { cn } from '../lib/utils'
import { apiFetch } from '../lib/api'
import { listObjects, createObject, updateObject, deleteObject } from '../lib/objectsApi'
import { commandArm } from '../lib/armApi'
import { startMapping, listSessions } from '../lib/mappingApi'
import { fetchSshAudit, execSsh } from '../lib/sshApi'
import { useAuthStore } from '../stores/authStore'

// `global` existe au runtime (jsdom/node) mais pas dans la lib TS DOM
declare const global: { fetch: unknown }

const ok = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: true, status, json: async () => body })

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ token: null })
})

describe('mapProjection', () => {
  const meta = { width: 100, height: 200, resolution: 0.05, originX: -1, originY: -2 }
  it('worldToPixel puis pixelToWorld = identité', () => {
    const px = worldToPixel(meta, 3.2, 1.5)
    const w = pixelToWorld(meta, px.x, px.y)
    expect(w.x).toBeCloseTo(3.2, 5)
    expect(w.y).toBeCloseTo(1.5, 5)
  })
})

describe('heatmapAccumulator', () => {
  afterEach(() => clearHeatmap())
  it('accumule les visites par cellule de 0.5m', () => {
    clearHeatmap()
    recordVisit(0.1, 0.1)
    recordVisit(0.2, 0.2)
    const cells = getHeatmapCells()
    expect(cells).toHaveLength(1)
    expect(cells[0].visits).toBe(2)
  })
})

describe('cn', () => {
  it('fusionne et dédoublonne les classes tailwind', () => {
    expect(cn('a', 'b')).toContain('a')
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})

describe('apiFetch', () => {
  it('ajoute le header Authorization si token', async () => {
    useAuthStore.setState({ token: 'abc' })
    const fetchMock = ok({})
    global.fetch = fetchMock
    await apiFetch('/x')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer abc')
  })

  it('déconnecte sur 401', async () => {
    useAuthStore.setState({ token: 'abc' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await apiFetch('/x')
    expect(useAuthStore.getState().token).toBeNull()
  })
})

describe('objectsApi', () => {
  it('listObjects -> GET /objects', async () => {
    const f = ok({ data: [{ id: 1, name: 'o', available: true, locationId: 1, imageUrl: null }] })
    global.fetch = f
    const objs = await listObjects()
    expect(objs).toHaveLength(1)
    expect(f).toHaveBeenCalledWith('/api/objects', expect.anything())
  })
  it('createObject -> POST /objects avec body', async () => {
    const f = ok({ data: { id: 2, name: 'x', available: true, locationId: 1, imageUrl: null } }, 201)
    global.fetch = f
    const o = await createObject({ name: 'x', locationId: 1 })
    expect(o.id).toBe(2)
    expect(f).toHaveBeenCalledWith('/api/objects', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ name: 'x', locationId: 1 })
  })
  it('updateObject -> objet maj', async () => {
    global.fetch = ok({ data: { id: 2, name: 'x', available: false, locationId: 1, imageUrl: null } })
    const o = await updateObject(2, { available: false })
    expect(o.available).toBe(false)
  })
  it('deleteObject -> 204 sans erreur', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    await expect(deleteObject(2)).resolves.toBeUndefined()
  })
  it('createObject -> remonte l erreur backend', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Emplacement introuvable' }) })
    await expect(createObject({ name: 'x', locationId: 9 })).rejects.toThrow('Emplacement introuvable')
  })
})

describe('autres wrappers REST', () => {
  it('commandArm -> POST /robots/:id/arm avec les articulations', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    global.fetch = f
    const cmd = { joint1: 1, joint2: 2, joint3: 3, joint4: 4, joint5: 5, joint6: 6 }
    await commandArm(1, cmd)
    expect(f).toHaveBeenCalledWith('/api/robots/1/arm', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toMatchObject(cmd)
  })
  it('startMapping -> POST /mapping/start', async () => {
    const f = ok({ sessionId: 7, state: 'STARTING' })
    global.fetch = f
    const r = await startMapping(1)
    expect(r.sessionId).toBe(7)
    expect(f).toHaveBeenCalledWith('/api/mapping/start', expect.objectContaining({ method: 'POST' }))
  })
  it('listSessions -> GET /mapping/sessions?robotId', async () => {
    const f = ok([{ id: 1, robotId: 1, state: 'STOPPED', startedAt: '', endedAt: null, coverageM2: null, failureReason: null }])
    global.fetch = f
    const r = await listSessions(1)
    expect(r).toHaveLength(1)
    expect(f).toHaveBeenCalledWith('/api/mapping/sessions?robotId=1', expect.anything())
  })
  it('fetchSshAudit -> GET /admin/ssh/audit', async () => {
    const f = ok([])
    global.fetch = f
    await fetchSshAudit(1)
    expect(f.mock.calls[0][0]).toContain('/api/admin/ssh/audit')
  })
  it('execSsh -> POST /admin/ssh/exec avec la commande', async () => {
    const f = ok({ stdout: 'ok', stderr: '', code: 0 })
    global.fetch = f
    const r = await execSsh(1, 'ls')
    expect(r.stdout).toBe('ok')
    expect(f).toHaveBeenCalledWith('/api/admin/ssh/exec', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ robotId: 1, command: 'ls' })
  })
})
