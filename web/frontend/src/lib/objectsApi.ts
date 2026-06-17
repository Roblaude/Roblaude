import { apiFetch } from './api'

export interface GraspObject {
  id: number
  name: string
  imageUrl: string | null
  color: string
  available: boolean
  locationId: number
  location?: { id: number; name: string; slug: string }
}

export interface ObjectInput {
  name: string
  imageUrl?: string
  color?: string
  available?: boolean
  locationId: number
}

export async function listObjects(): Promise<GraspObject[]> {
  const res = await apiFetch('/objects')
  if (!res.ok) throw new Error(`listObjects ${res.status}`)
  const json = (await res.json()) as { data: GraspObject[] }
  return json.data
}

export async function createObject(input: ObjectInput): Promise<GraspObject> {
  const res = await apiFetch('/objects', { method: 'POST', body: JSON.stringify(input) })
  if (!res.ok) {
    const e = (await res.json().catch(() => ({ error: `createObject ${res.status}` }))) as { error: string }
    throw new Error(e.error)
  }
  const json = (await res.json()) as { data: GraspObject }
  return json.data
}

export async function updateObject(id: number, input: Partial<ObjectInput>): Promise<GraspObject> {
  const res = await apiFetch(`/objects/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  if (!res.ok) {
    const e = (await res.json().catch(() => ({ error: `updateObject ${res.status}` }))) as { error: string }
    throw new Error(e.error)
  }
  const json = (await res.json()) as { data: GraspObject }
  return json.data
}

export async function deleteObject(id: number): Promise<void> {
  const res = await apiFetch(`/objects/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const e = (await res.json().catch(() => ({ error: `deleteObject ${res.status}` }))) as { error: string }
    throw new Error(e.error)
  }
}
