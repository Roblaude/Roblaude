import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import { signToken } from '../middleware/auth'
import { robotMqtt } from '../services/mqtt'
import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
let token: string

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `arm-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'a', role: Role.USER },
  })
  token = signToken({ userId: u.id, email: u.email, role: u.role })
  // cleanup user a la fin pas critique pour les tests
  vi.spyOn(robotMqtt, 'publishCommand').mockReturnValue(true)
})

describe('POST /api/robots/:id/arm', () => {
  it('202 sur commande valide', async () => {
    const res = await request(app)
      .post('/api/robots/1/arm')
      .set('Authorization', `Bearer ${token}`)
      .send({ joint1: 10, joint2: -20, joint3: 30, joint4: -40, joint5: 50, joint6: 90, time: 800 })
    expect(res.status).toBe(202)
    expect(res.body.ok).toBe(true)
  })

  it('time par defaut a 500ms', async () => {
    const res = await request(app)
      .post('/api/robots/1/arm')
      .set('Authorization', `Bearer ${token}`)
      .send({ joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0 })
    expect(res.status).toBe(202)
    expect(res.body.sent.time).toBe(500)
  })

  it('400 si joint manquant', async () => {
    const res = await request(app)
      .post('/api/robots/1/arm')
      .set('Authorization', `Bearer ${token}`)
      .send({ joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0 })
    expect(res.status).toBe(400)
  })

  it('400 si joint hors borne', async () => {
    const res = await request(app)
      .post('/api/robots/1/arm')
      .set('Authorization', `Bearer ${token}`)
      .send({ joint1: 999, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0 })
    expect(res.status).toBe(400)
  })

  it('401 sans token', async () => {
    const res = await request(app)
      .post('/api/robots/1/arm')
      .send({ joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0 })
    expect(res.status).toBe(401)
  })

  it('400 si robotId invalide', async () => {
    const res = await request(app)
      .post('/api/robots/abc/arm')
      .set('Authorization', `Bearer ${token}`)
      .send({ joint1: 0, joint2: 0, joint3: 0, joint4: 0, joint5: 0, joint6: 0 })
    expect(res.status).toBe(400)
  })
})
