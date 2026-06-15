import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'

const prisma = new PrismaClient()
let adminToken: string
let userToken: string
let adminId: number
let userId: number
const createdPointIds: number[] = []

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `pt-admin-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'a', role: Role.ADMIN },
  })
  adminId = admin.id
  adminToken = signToken({ userId: admin.id, email: admin.email, role: admin.role })
  const user = await prisma.user.create({
    data: { email: `pt-user-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'u', role: Role.USER },
  })
  userId = user.id
  userToken = signToken({ userId: user.id, email: user.email, role: user.role })
})

afterAll(async () => {
  await prisma.mission.deleteMany({ where: { userId } })
  await prisma.point.deleteMany({ where: { id: { in: createdPointIds } } })
  await prisma.user.delete({ where: { id: adminId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

async function makePoint(): Promise<number> {
  const res = await request(app)
    .post('/api/points')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'P', slug: `pt-${Date.now()}-${Math.round(performance.now())}`, x: 1, y: 2 })
  createdPointIds.push(res.body.data.id)
  return res.body.data.id
}

describe('points — lecture', () => {
  it('GET /api/points -> 200', async () => {
    const res = await request(app).get('/api/points').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('GET /api/points/:id -> 200', async () => {
    const id = await makePoint()
    const res = await request(app).get(`/api/points/${id}`).set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(id)
  })

  it('GET /api/points/:id inexistant -> 404', async () => {
    const res = await request(app).get('/api/points/999999').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(404)
  })

  it('GET /api/points/:id id invalide -> 400', async () => {
    const res = await request(app).get('/api/points/abc').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(400)
  })
})

describe('points — admin CRUD', () => {
  it('POST crée (admin) -> 201', async () => {
    const id = await makePoint()
    expect(id).toBeGreaterThan(0)
  })

  it('POST refusé pour un non-admin -> 403', async () => {
    const res = await request(app)
      .post('/api/points')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'X', slug: `x-${Date.now()}`, x: 0, y: 0 })
    expect(res.status).toBe(403)
  })

  it('POST slug invalide -> 400', async () => {
    const res = await request(app)
      .post('/api/points')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X', slug: 'Pas Valide!', x: 0, y: 0 })
    expect(res.status).toBe(400)
  })

  it('PUT modifie (admin) -> 200', async () => {
    const id = await makePoint()
    const res = await request(app)
      .put(`/api/points/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renommé' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Renommé')
  })

  it('DELETE (admin) -> 204', async () => {
    const id = await makePoint()
    const res = await request(app).delete(`/api/points/${id}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })

  it('DELETE refusé si le point est lié à une mission -> 400', async () => {
    const from = await makePoint()
    const to = await makePoint()
    await prisma.mission.create({
      data: { type: 'TRANSPORT', userId, fromPointId: from, toPointId: to },
    })
    const res = await request(app).delete(`/api/points/${from}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(400)
    expect(res.body.linkedMissions).toBeGreaterThanOrEqual(1)
  })
})
