import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'

const prisma = new PrismaClient()
let token: string
let userId: number
let fromId: number
let toId: number
let objectId: number

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `pp-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'pp', role: Role.USER },
  })
  userId = u.id
  token = signToken({ userId: u.id, email: u.email, role: u.role })

  const a = await prisma.point.create({ data: { name: 'A', slug: `a-${Date.now()}`, x: 0, y: 0 } })
  const b = await prisma.point.create({ data: { name: 'B', slug: `b-${Date.now()}`, x: 1, y: 1 } })
  fromId = a.id
  toId = b.id

  const o = await prisma.graspObject.create({ data: { name: 'colis', locationId: a.id } })
  objectId = o.id
})

afterAll(async () => {
  await prisma.mission.deleteMany({ where: { userId } })
  await prisma.graspObject.delete({ where: { id: objectId } })
  await prisma.point.deleteMany({ where: { id: { in: [fromId, toId] } } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('création mission pick & place (#134)', () => {
  it('refuse 400 un PICK_AND_PLACE sans objectId', async () => {
    const res = await request(app)
      .post('/api/missions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'PICK_AND_PLACE', fromPointId: fromId, toPointId: toId })
    expect(res.status).toBe(400)
  })

  it('refuse 400 un objectId inexistant', async () => {
    const res = await request(app)
      .post('/api/missions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'PICK_AND_PLACE', fromPointId: fromId, toPointId: toId, objectId: 999999 })
    expect(res.status).toBe(400)
  })

  it('cree un PICK_AND_PLACE valide avec objet', async () => {
    const res = await request(app)
      .post('/api/missions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'PICK_AND_PLACE', fromPointId: fromId, toPointId: toId, objectId })
    expect(res.status).toBe(201)
    expect(res.body.data.type).toBe('PICK_AND_PLACE')
    expect(res.body.data.object.id).toBe(objectId)
  })
})
