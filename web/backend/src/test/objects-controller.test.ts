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
let pointId: number

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `obj-admin-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'admin', role: Role.ADMIN },
  })
  adminId = admin.id
  adminToken = signToken({ userId: admin.id, email: admin.email, role: admin.role })

  const user = await prisma.user.create({
    data: { email: `obj-user-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'user', role: Role.USER },
  })
  userId = user.id
  userToken = signToken({ userId: user.id, email: user.email, role: user.role })

  const p = await prisma.point.create({ data: { name: 'Stock', slug: `stock-${Date.now()}`, x: 0, y: 0 } })
  pointId = p.id
})

afterAll(async () => {
  await prisma.graspObject.deleteMany({ where: { locationId: pointId } })
  await prisma.point.delete({ where: { id: pointId } })
  await prisma.user.delete({ where: { id: adminId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('objects CRUD', () => {
  let createdId = 0

  it('POST cree (admin)', async () => {
    const res = await request(app)
      .post('/api/objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'colis A', locationId: pointId })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('colis A')
    expect(res.body.data.available).toBe(true)
    createdId = res.body.data.id
  })

  it('GET liste inclut l emplacement', async () => {
    const res = await request(app).get('/api/objects').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const found = res.body.data.find((o: { id: number }) => o.id === createdId)
    expect(found.location.id).toBe(pointId)
  })

  it('PUT modifie (admin)', async () => {
    const res = await request(app)
      .put(`/api/objects/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ available: false })
    expect(res.status).toBe(200)
    expect(res.body.data.available).toBe(false)
  })

  it('refuse 403 pour un non-admin', async () => {
    const res = await request(app)
      .post('/api/objects')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'x', locationId: pointId })
    expect(res.status).toBe(403)
  })

  it('refuse 400 si emplacement inexistant', async () => {
    const res = await request(app)
      .post('/api/objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x', locationId: 999999 })
    expect(res.status).toBe(400)
  })

  it('refuse 400 sans nom', async () => {
    const res = await request(app)
      .post('/api/objects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ locationId: pointId })
    expect(res.status).toBe(400)
  })

  it('DELETE supprime (admin)', async () => {
    const res = await request(app).delete(`/api/objects/${createdId}`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })
})
