import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../services/sshConnection', () => ({ runOnce: vi.fn() }))

import request from 'supertest'
import { app } from '../app'
import { runOnce } from '../services/sshConnection'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'
import { repairCommand } from '../lib/repairActions'

const mockRunOnce = vi.mocked(runOnce)
const prisma = new PrismaClient()
let adminToken: string
let userToken: string
let adminId: number
let userId: number
let robotId: number

beforeAll(async () => {
  const a = await prisma.user.create({
    data: { email: `adm-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'adm', role: Role.ADMIN },
  })
  adminId = a.id
  adminToken = signToken({ userId: a.id, email: a.email, role: a.role })
  const u = await prisma.user.create({
    data: { email: `usr-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'usr', role: Role.USER },
  })
  userId = u.id
  userToken = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `rep-${Date.now()}`, battery: 77 } })
  robotId = r.id
})

afterAll(async () => {
  await prisma.sshAuditLog.deleteMany({ where: { robotId } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } })
  await prisma.$disconnect()
})

beforeEach(() => {
  mockRunOnce.mockReset()
})

describe('repairActions (pur)', () => {
  it('mappe chaque action vers sa commande fixe', () => {
    expect(repairCommand('reconnect_stm32')).toBe('sudo systemctl restart micro-ros-agent.service')
    expect(repairCommand('restart_ros')).toBe('docker restart m3pro')
    expect(repairCommand('reboot')).toBe('sudo reboot')
    expect(repairCommand('shutdown')).toBe('docker stop -t 6 m3pro; sudo shutdown -h now')
    expect(repairCommand('resync_clock', '2026-06-17 10:00:00')).toBe('sudo date -u -s "2026-06-17 10:00:00"')
  })
})

describe('GET /api/admin/robots/:id/health', () => {
  it('consolide la sonde + la batterie', async () => {
    mockRunOnce.mockResolvedValue({
      stdout: '{"myserial_ok":true,"agent":"active","m3pro":"up","yb_node":true}',
      stderr: '',
      code: 0,
    })
    const res = await request(app).get(`/api/admin/robots/${robotId}/health`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ reachable: true, stm32: 'ok', ybNode: 'ok', agent: 'active', m3pro: 'up', battery: 77 })
  })

  it('robot injoignable -> reachable false, etats unknown', async () => {
    mockRunOnce.mockRejectedValue(new Error('ssh timeout'))
    const res = await request(app).get(`/api/admin/robots/${robotId}/health`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.reachable).toBe(false)
    expect(res.body.stm32).toBe('unknown')
  })

  it('refuse un non-admin (403)', async () => {
    const res = await request(app).get(`/api/admin/robots/${robotId}/health`).set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/robots/:id/repair', () => {
  it('reconnect_stm32 lance la bonne commande + audit', async () => {
    mockRunOnce.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reconnect_stm32' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(mockRunOnce).toHaveBeenCalledWith(robotId, 'sudo systemctl restart micro-ros-agent.service', expect.any(Number))
    const audit = await prisma.sshAuditLog.findFirst({ where: { robotId }, orderBy: { id: 'desc' } })
    expect(audit?.command).toBe('sudo systemctl restart micro-ros-agent.service')
  })

  it('action inconnue -> 400', async () => {
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'rm -rf /' })
    expect(res.status).toBe(400)
    expect(mockRunOnce).not.toHaveBeenCalled()
  })

  it('reboot sans confirm -> 400', async () => {
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reboot' })
    expect(res.status).toBe(400)
    expect(mockRunOnce).not.toHaveBeenCalled()
  })

  it('reboot avec confirm -> ok meme si la connexion tombe', async () => {
    mockRunOnce.mockRejectedValue(new Error('ssh timeout'))
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reboot', confirm: true })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('shutdown sans confirm -> 400', async () => {
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'shutdown' })
    expect(res.status).toBe(400)
    expect(mockRunOnce).not.toHaveBeenCalled()
  })

  it('shutdown avec confirm -> ok meme si la connexion tombe', async () => {
    mockRunOnce.mockRejectedValue(new Error('ssh timeout'))
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'shutdown', confirm: true })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('refuse un non-admin (403)', async () => {
    const res = await request(app)
      .post(`/api/admin/robots/${robotId}/repair`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'reconnect_stm32' })
    expect(res.status).toBe(403)
  })
})
