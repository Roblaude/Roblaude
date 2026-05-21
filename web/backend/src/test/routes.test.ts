import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

describe('Routes protegees (sans token = 401)', () => {
  it('GET /api/missions → 401', async () => {
    const res = await request(app).get('/api/missions')
    expect(res.status).toBe(401)
  })

  it('GET /api/missions/1 → 401', async () => {
    const res = await request(app).get('/api/missions/1')
    expect(res.status).toBe(401)
  })

  it('POST /api/missions → 401', async () => {
    const res = await request(app).post('/api/missions').send({})
    expect(res.status).toBe(401)
  })

  it('GET /api/points → 401', async () => {
    const res = await request(app).get('/api/points')
    expect(res.status).toBe(401)
  })

  it('POST /api/points → 401', async () => {
    const res = await request(app).post('/api/points').send({})
    expect(res.status).toBe(401)
  })

  it('GET /api/robots → 401', async () => {
    const res = await request(app).get('/api/robots')
    expect(res.status).toBe(401)
  })

  it('GET /api/robots/1/status → 401', async () => {
    const res = await request(app).get('/api/robots/1/status')
    expect(res.status).toBe(401)
  })

  it('POST /api/missions/1/resume → 401', async () => {
    const res = await request(app).post('/api/missions/1/resume').send({})
    expect(res.status).toBe(401)
  })

  it('POST /api/missions/1/stop → 401', async () => {
    const res = await request(app).post('/api/missions/1/stop').send({})
    expect(res.status).toBe(401)
  })

  it('POST /api/missions/1/confirm-loading → 401', async () => {
    const res = await request(app).post('/api/missions/1/confirm-loading').send({})
    expect(res.status).toBe(401)
  })
})

describe('Routes publiques', () => {
  it('GET /health → 200', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('POST /api/auth/register → 401 (admin-only)', async () => {
    const res = await request(app).post('/api/auth/register').send({})
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/login → 400 (sans body)', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})
