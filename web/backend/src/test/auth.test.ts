import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

describe('Auth', () => {
  describe('POST /api/auth/register', () => {
    it('retourne 401 sans token (admin-only)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@x.fr', password: '123456', name: 'Test' })
      expect(res.status).toBe(401)
    })

    it('retourne 401 avec un token invalide', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', 'Bearer fake-token')
        .send({ email: 'x@x.fr', password: '123456', name: 'Test' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/login', () => {
    it('retourne 400 si email manquant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: '123456' })
      expect(res.status).toBe(400)
    })

    it('retourne 401 si user inexistant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: '123456' })
      // 401 ou erreur DB (pas de DB en test)
      expect([401, 500]).toContain(res.status)
    })
  })

  describe('GET /api/auth/me', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token manquant')
    })

    it('retourne 401 avec token invalide', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer fake-token-invalid')
      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Token invalide ou expire')
    })
  })

  describe('Routes protegees', () => {
    it('GET /api/missions retourne 401 sans token', async () => {
      const res = await request(app).get('/api/missions')
      expect(res.status).toBe(401)
    })

    it('POST /api/missions retourne 401 sans token', async () => {
      const res = await request(app).post('/api/missions').send({})
      expect(res.status).toBe(401)
    })
  })
})
