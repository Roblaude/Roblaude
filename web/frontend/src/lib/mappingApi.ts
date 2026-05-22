import { apiFetch } from './api'

// Wrappers REST /api/mapping. Le JWT est ajoute automatiquement par apiFetch.

export interface MappingSessionLite {
  id: number
  robotId: number
  state: 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED'
  startedAt: string
  endedAt: string | null
  coverageM2: number | null
  failureReason: string | null
  _count?: { snapshots: number; annotations: number }
}

export async function startMapping(robotId: number): Promise<{ sessionId: number; state: string }> {
  const res = await apiFetch('/mapping/start', {
    method: 'POST',
    body: JSON.stringify({ robotId }),
  })
  if (!res.ok) throw new Error(`startMapping ${res.status}`)
  return res.json()
}

export async function stopMapping(sessionId: number): Promise<{ ok: boolean }> {
  const res = await apiFetch('/mapping/stop', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  })
  if (!res.ok) throw new Error(`stopMapping ${res.status}`)
  return res.json()
}

export async function saveMapping(sessionId: number, name?: string): Promise<{ snapshotId: number }> {
  const res = await apiFetch('/mapping/save', {
    method: 'POST',
    body: JSON.stringify({ sessionId, ...(name ? { name } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.reason ?? `saveMapping ${res.status}`)
  }
  return res.json()
}

export async function listSessions(robotId: number): Promise<MappingSessionLite[]> {
  const res = await apiFetch(`/mapping/sessions?robotId=${robotId}`)
  if (!res.ok) throw new Error(`listSessions ${res.status}`)
  return res.json()
}
