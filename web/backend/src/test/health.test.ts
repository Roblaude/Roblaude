import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

describe('GET /health', () => {
  it('retourne 200 avec status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('Routes API', () => {
  it('/api/missions existe (ne retourne pas 404)', async () => {
    const res = await request(app).get('/api/missions')
    // Peut retourner 500 (pas de DB) mais pas 404
    expect(res.status).not.toBe(404)
  })
})
