import { apiFetch } from './api'

export interface Annotation {
  id: number
  mapSnapshotId: number
  sessionId: number | null
  label: string
  icon: string | null
  color: string | null
  x: number
  y: number
  createdById: number
  createdBy: { id: number; name: string } | null
  createdAt: string
}

export async function listAnnotations(mapSnapshotId: number): Promise<Annotation[]> {
  const res = await apiFetch(`/annotations?mapSnapshotId=${mapSnapshotId}`)
  if (!res.ok) throw new Error(`listAnnotations ${res.status}`)
  return res.json()
}

export async function createAnnotation(input: {
  mapSnapshotId: number
  label: string
  x: number
  y: number
  color?: string
  icon?: string
}): Promise<Annotation> {
  const res = await apiFetch('/annotations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`createAnnotation ${res.status}`)
  return res.json()
}

export async function deleteAnnotation(id: number): Promise<void> {
  const res = await apiFetch(`/annotations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`deleteAnnotation ${res.status}`)
}
