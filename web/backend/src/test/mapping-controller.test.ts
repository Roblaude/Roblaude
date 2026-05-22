import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'
import { robotMqtt } from '../services/mqtt'

const prisma = new PrismaClient()

let userToken: string
let robotId: number
let userId: number

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      email: `mc-${Date.now()}@x.com`,
      password: bcrypt.hashSync('x', 4),
      name: 'mc',
      role: Role.USER,
    },
  })
  userId = u.id
  userToken = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `r-${Date.now()}` } })
  robotId = r.id
})

afterAll(async () => {
  await prisma.mapSnapshot.deleteMany({ where: { robotId } })
  await prisma.mappingSession.deleteMany({ where: { robotId } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

beforeEach(() => {
  // mqtt non connecte en test : on stub publishCommand
  vi.spyOn(robotMqtt, 'publishCommand').mockReturnValue(true)
})

describe('POST /api/mapping/start', () => {
  it('cree une session STARTING + retourne sessionId', async () => {
    const res = await request(app)
      .post('/api/mapping/start')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ robotId })
    expect(res.status).toBe(201)
    expect(res.body.sessionId).toBeGreaterThan(0)
    expect(res.body.state).toBe('STARTING')
  })

  it('refuse 400 si robotId manquant', async () => {
    const res = await request(app)
      .post('/api/mapping/start')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('refuse 401 sans token', async () => {
    const res = await request(app).post('/api/mapping/start').send({ robotId })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/mapping/stop', () => {
  it('publie cmd/mapping/stop sans erreur', async () => {
    const session = await prisma.mappingSession.create({
      data: { robotId, startedById: userId, state: 'RUNNING' },
    })
    const res = await request(app)
      .post('/api/mapping/stop')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ sessionId: session.id })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('refuse 404 si sessionId inconnu', async () => {
    const res = await request(app)
      .post('/api/mapping/stop')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ sessionId: 999999 })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/mapping/sessions', () => {
  it('liste les sessions du robot', async () => {
    const res = await request(app)
      .get(`/api/mapping/sessions?robotId=${robotId}`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('refuse 400 sans robotId', async () => {
    const res = await request(app)
      .get('/api/mapping/sessions')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(400)
  })
})
