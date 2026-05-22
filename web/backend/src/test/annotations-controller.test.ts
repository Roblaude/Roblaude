import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'

const prisma = new PrismaClient()
let userToken: string
let userId: number
let robotId: number
let snapshotId: number
let sessionId: number

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `a-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'a', role: Role.USER },
  })
  userId = u.id
  userToken = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `r-${Date.now()}` } })
  robotId = r.id
  const s = await prisma.mappingSession.create({
    data: { robotId, startedById: userId, state: 'STOPPED' },
  })
  sessionId = s.id
  const snap = await prisma.mapSnapshot.create({
    data: {
      sessionId, robotId, name: 'demo',
      pgmPath: '', yamlPath: '', pngPath: '',
      widthPx: 100, heightPx: 100, resolutionM: 0.05,
      originX: 0, originY: 0, originTheta: 0, sizeBytes: 0,
    },
  })
  snapshotId = snap.id
})

afterAll(async () => {
  await prisma.annotation.deleteMany({ where: { mapSnapshotId: snapshotId } })
  await prisma.mapSnapshot.delete({ where: { id: snapshotId } })
  await prisma.mappingSession.delete({ where: { id: sessionId } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('annotations CRUD', () => {
  let createdId = 0

  it('POST cree', async () => {
    const res = await request(app)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ mapSnapshotId: snapshotId, label: 'bureau 201', x: 1.5, y: 2.3 })
    expect(res.status).toBe(201)
    expect(res.body.label).toBe('bureau 201')
    createdId = res.body.id
  })

  it('GET liste', async () => {
    const res = await request(app)
      .get(`/api/annotations?mapSnapshotId=${snapshotId}`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
  })

  it('PATCH modifie le label', async () => {
    const res = await request(app)
      .patch(`/api/annotations/${createdId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ label: 'bureau 202' })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('bureau 202')
  })

  it('DELETE supprime', async () => {
    const res = await request(app)
      .delete(`/api/annotations/${createdId}`)
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(204)
  })

  it('refuse 400 sans mapSnapshotId sur GET', async () => {
    const res = await request(app)
      .get('/api/annotations')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(400)
  })
})
