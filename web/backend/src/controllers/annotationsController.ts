import type { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { mqttEvents } from '../services/mqttEvents'

// CRUD annotations sur les snapshots de cartes (T3.5.6).
// Chaque mutation emet aussi annotation_change sur mqttEvents -> wsTelemetry
// le broadcast aux clients de la room du robot.

const createSchema = z.object({
  mapSnapshotId: z.number().int().positive(),
  sessionId: z.number().int().positive().optional(),
  label: z.string().min(1).max(200),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  x: z.number(),
  y: z.number(),
})
const updateSchema = createSchema.partial().omit({ mapSnapshotId: true })

export async function listAnnotations(req: Request, res: Response): Promise<void> {
  const mapSnapshotId = Number(req.query.mapSnapshotId)
  if (!Number.isInteger(mapSnapshotId)) {
    res.status(400).json({ error: 'mapSnapshotId query param required' })
    return
  }
  const items = await prisma.annotation.findMany({
    where: { mapSnapshotId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json(items)
}

export async function createAnnotation(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', issues: parsed.error.issues })
    return
  }
  const userId = req.user?.userId
  if (!userId) { res.status(401).json({ error: 'auth required' }); return }
  const snap = await prisma.mapSnapshot.findUnique({ where: { id: parsed.data.mapSnapshotId } })
  if (!snap) { res.status(404).json({ error: 'snapshot not found' }); return }
  const a = await prisma.annotation.create({
    data: { ...parsed.data, createdById: userId },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  mqttEvents.emit('annotation_change', { robotId: snap.robotId, action: 'created', annotation: a })
  res.status(201).json(a)
}

export async function updateAnnotation(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return }
  const existing = await prisma.annotation.findUnique({ where: { id }, include: { mapSnapshot: true } })
  if (!existing) { res.status(404).json({ error: 'not found' }); return }
  const a = await prisma.annotation.update({
    where: { id },
    data: parsed.data,
    include: { createdBy: { select: { id: true, name: true } } },
  })
  mqttEvents.emit('annotation_change', { robotId: existing.mapSnapshot.robotId, action: 'updated', annotation: a })
  res.json(a)
}

export async function deleteAnnotation(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const existing = await prisma.annotation.findUnique({ where: { id }, include: { mapSnapshot: true } })
  if (!existing) { res.status(404).json({ error: 'not found' }); return }
  await prisma.annotation.delete({ where: { id } })
  mqttEvents.emit('annotation_change', { robotId: existing.mapSnapshot.robotId, action: 'deleted', id })
  res.status(204).end()
}
