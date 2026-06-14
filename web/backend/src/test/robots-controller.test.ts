import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { signToken } from '../middleware/auth'

const prisma = new PrismaClient()
let token: string
let userId: number
let robotId: number

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `rb-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'rb', role: Role.USER },
  })
  userId = u.id
  token = signToken({ userId: u.id, email: u.email, role: u.role })
  const r = await prisma.robot.create({ data: { name: `r-${Date.now()}`, battery: 80 } })
  robotId = r.id
})

afterAll(async () => {
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('robots', () => {
  it('GET /api/robots -> 200 liste', async () => {
    const res = await request(app).get('/api/robots').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('GET /api/robots/:id/status -> 200', async () => {
    const res = await request(app).get(`/api/robots/${robotId}/status`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(robotId)
    expect(res.body.data.battery).toBe(80)
  })

  it('GET /api/robots/:id/status inexistant -> 404', async () => {
    const res = await request(app).get('/api/robots/999999/status').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('GET /api/robots/:id/status id invalide -> 400', async () => {
    const res = await request(app).get('/api/robots/abc/status').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})
