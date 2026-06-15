import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role, MissionStatus, RobotStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'
import { missionWatchdog } from '../services/missionWatchdog'

const prisma = new PrismaClient()
let token: string
let userId: number
let robotId: number
let fromId: number
let toId: number

const createMission = (status: MissionStatus, withRobot: boolean) =>
  prisma.mission.create({
    data: {
      type: 'TRANSPORT',
      status,
      userId,
      fromPointId: fromId,
      toPointId: toId,
      robotId: withRobot ? robotId : null,
    },
  })

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `mc-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'mc', role: Role.USER },
  })
  userId = u.id
  token = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `r-${Date.now()}`, status: RobotStatus.BUSY } })
  robotId = r.id
  const a = await prisma.point.create({ data: { name: 'A', slug: `mca-${Date.now()}`, x: 0, y: 0 } })
  const b = await prisma.point.create({ data: { name: 'B', slug: `mcb-${Date.now()}`, x: 1, y: 1 } })
  fromId = a.id
  toId = b.id
})

afterEach(() => missionWatchdog.clearAll())

afterAll(async () => {
  await prisma.mission.deleteMany({ where: { userId } })
  await prisma.point.deleteMany({ where: { id: { in: [fromId, toId] } } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('missions — list & get', () => {
  it('GET /api/missions retourne data + total', async () => {
    await createMission(MissionStatus.PENDING, false)
    const res = await request(app).get('/api/missions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('GET /api/missions filtre par status', async () => {
    const res = await request(app).get('/api/missions?status=PENDING').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.every((m: { status: string }) => m.status === 'PENDING')).toBe(true)
  })

  it('GET /api/missions params invalides -> 400', async () => {
    const res = await request(app).get('/api/missions?status=NOPE').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('GET /api/missions/:id existant -> 200', async () => {
    const m = await createMission(MissionStatus.PENDING, false)
    const res = await request(app).get(`/api/missions/${m.id}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(m.id)
  })

  it('GET /api/missions/:id inexistant -> 404', async () => {
    const res = await request(app).get('/api/missions/999999').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('GET /api/missions/:id id non numerique -> 400', async () => {
    const res = await request(app).get('/api/missions/abc').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})

describe('missions — cancel', () => {
  it('annule une mission PENDING + libere le robot', async () => {
    const m = await createMission(MissionStatus.PENDING, true)
    const res = await request(app).post(`/api/missions/${m.id}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')
    const robot = await prisma.robot.findUnique({ where: { id: robotId } })
    expect(robot?.status).toBe('AVAILABLE')
  })

  it('refuse d annuler une mission terminee -> 400', async () => {
    const m = await createMission(MissionStatus.COMPLETED, false)
    const res = await request(app).post(`/api/missions/${m.id}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('cancel d une mission inexistante -> 404', async () => {
    const res = await request(app).post('/api/missions/999999/cancel').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('missions — stop (arret d urgence)', () => {
  it('stoppe une mission active + libere le robot', async () => {
    await prisma.robot.update({ where: { id: robotId }, data: { status: RobotStatus.BUSY } })
    const m = await createMission(MissionStatus.NAVIGATING_TO_PICKUP, true)
    const res = await request(app).post(`/api/missions/${m.id}/stop`).set('Authorization', `Bearer ${token}`).send({ reason: 'test-stop' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')
    const robot = await prisma.robot.findUnique({ where: { id: robotId } })
    expect(robot?.status).toBe('AVAILABLE')
  })

  it('refuse de stopper une mission sans robot -> 400', async () => {
    const m = await createMission(MissionStatus.PENDING, false)
    const res = await request(app).post(`/api/missions/${m.id}/stop`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('stop d une mission inexistante -> 404', async () => {
    const res = await request(app).post('/api/missions/999999/stop').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('missions — resume', () => {
  it('reprend une mission PAUSED avec robot', async () => {
    const m = await createMission(MissionStatus.PAUSED, true)
    const res = await request(app).post(`/api/missions/${m.id}/resume`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const robot = await prisma.robot.findUnique({ where: { id: robotId } })
    expect(robot?.status).toBe('BUSY')
  })

  it('refuse de reprendre une mission non PAUSED -> 400', async () => {
    const m = await createMission(MissionStatus.PENDING, true)
    const res = await request(app).post(`/api/missions/${m.id}/resume`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('resume d une mission inexistante -> 404', async () => {
    const res = await request(app).post('/api/missions/999999/resume').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('missions — confirm-loading', () => {
  it('confirme le chargement quand la mission attend', async () => {
    const m = await createMission(MissionStatus.WAITING_FOR_LOAD, true)
    const res = await request(app).post(`/api/missions/${m.id}/confirm-loading`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('refuse si la mission n attend pas de chargement -> 400', async () => {
    const m = await createMission(MissionStatus.PENDING, true)
    const res = await request(app).post(`/api/missions/${m.id}/confirm-loading`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})
