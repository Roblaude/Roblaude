import type { Request, Response } from 'express'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import prisma from '../lib/prisma'
import { robotMqtt } from '../services/mqtt'
import { mqttEvents } from '../services/mqttEvents'
import { saveSnapshotFiles, getSnapshotPath } from '../lib/mapStorage'

// Endpoints REST mapping (T3.5.5). Toutes les routes sont derriere authGuard
// (mount dans app.ts). saveMapping est asynchrone : on attend l'event
// mapping_save_result emis par mqtt.ts apres reception du payload robot.

const startSchema = z.object({ robotId: z.number().int().positive() })
const stopSchema = z.object({ sessionId: z.number().int().positive() })
const saveSchema = z.object({ sessionId: z.number().int().positive(), name: z.string().optional() })
const localizeSchema = z.object({ robotId: z.number().int().positive(), map: z.string().optional() })

const SAVE_TIMEOUT_MS = 30_000

export async function startMapping(req: Request, res: Response): Promise<void> {
  const parsed = startSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', issues: parsed.error.issues })
    return
  }
  const userId = req.user?.userId
  if (!userId) { res.status(401).json({ error: 'auth required' }); return }

  const session = await prisma.mappingSession.create({
    data: { robotId: parsed.data.robotId, startedById: userId, state: 'STARTING' },
  })
  robotMqtt.publishCommand(parsed.data.robotId, 'mapping/start', { sessionId: session.id })
  res.status(201).json({ sessionId: session.id, state: session.state })
}

export async function stopMapping(req: Request, res: Response): Promise<void> {
  const parsed = stopSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return }
  const session = await prisma.mappingSession.findUnique({ where: { id: parsed.data.sessionId } })
  if (!session) { res.status(404).json({ error: 'session not found' }); return }
  robotMqtt.publishCommand(session.robotId, 'mapping/stop', { sessionId: session.id })
  res.status(200).json({ ok: true })
}

// Bascule le robot en mode LOCALISATION (amcl sur carte figee, ne modifie pas
// la carte). Le mapping_supervisor lance localization.launch.py.
export async function localizeMapping(req: Request, res: Response): Promise<void> {
  const parsed = localizeSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return }
  const userId = req.user?.userId
  if (!userId) { res.status(401).json({ error: 'auth required' }); return }
  robotMqtt.publishCommand(parsed.data.robotId, 'mapping/localize', { map: parsed.data.map })
  res.status(200).json({ ok: true, mode: 'localization' })
}

export async function saveMapping(req: Request, res: Response): Promise<void> {
  const parsed = saveSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'invalid body' }); return }
  const session = await prisma.mappingSession.findUnique({ where: { id: parsed.data.sessionId } })
  if (!session) { res.status(404).json({ error: 'session not found' }); return }

  const messageId = randomUUID()
  const name = parsed.data.name ?? `session-${session.id}-${Date.now()}`

  // On installe le listener AVANT de publier — sinon le robot pourrait
  // repondre tres vite (cas mock) avant qu'on soit en ecoute.
  const resultPromise = new Promise<{
    ok: boolean
    pgm_base64?: string
    yaml?: string
    reason?: string
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      mqttEvents.removeListener('mapping_save_result', handler)
      reject(new Error('timeout 30s'))
    }, SAVE_TIMEOUT_MS)
    const handler = (e: { messageId?: string; ok: boolean; pgm_base64?: string; yaml?: string; reason?: string }): void => {
      if (e.messageId !== messageId) return
      clearTimeout(timeout)
      mqttEvents.removeListener('mapping_save_result', handler)
      resolve(e)
    }
    mqttEvents.on('mapping_save_result', handler)
  })

  robotMqtt.publishCommand(session.robotId, 'mapping/save', {
    sessionId: session.id, name, messageId,
  })

  try {
    const result = await resultPromise
    if (!result.ok || !result.pgm_base64 || !result.yaml) {
      res.status(500).json({ ok: false, reason: result.reason ?? 'missing pgm/yaml' })
      return
    }
    // Cree d'abord la ligne (id auto) pour avoir le filename, puis ecrit
    // les fichiers, puis update les paths/dimensions.
    const snapshot = await prisma.mapSnapshot.create({
      data: {
        sessionId: session.id,
        robotId: session.robotId,
        name,
        pgmPath: '', yamlPath: '', pngPath: '',
        widthPx: 0, heightPx: 0, resolutionM: 0,
        originX: 0, originY: 0, originTheta: 0, sizeBytes: 0,
      },
    })
    const files = await saveSnapshotFiles(snapshot.id, result.pgm_base64, result.yaml)
    await prisma.mapSnapshot.update({ where: { id: snapshot.id }, data: files })
    res.status(201).json({ snapshotId: snapshot.id, ...files })
  } catch (err) {
    res.status(504).json({ ok: false, reason: err instanceof Error ? err.message : 'unknown error' })
  }
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.query.robotId)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'robotId query param required' })
    return
  }
  const sessions = await prisma.mappingSession.findMany({
    where: { robotId },
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: { _count: { select: { snapshots: true, annotations: true } } },
  })
  res.status(200).json(sessions)
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const session = await prisma.mappingSession.findUnique({
    where: { id },
    include: {
      snapshots: true,
      annotations: true,
      startedBy: { select: { id: true, name: true, email: true } },
    },
  })
  if (!session) { res.status(404).json({ error: 'not found' }); return }
  res.status(200).json(session)
}

export async function downloadSnapshot(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const ext = req.params.ext as 'pgm' | 'yaml' | 'png'
  if (!['pgm', 'yaml', 'png'].includes(ext)) {
    res.status(400).json({ error: 'invalid ext' })
    return
  }
  const snapshot = await prisma.mapSnapshot.findUnique({ where: { id } })
  if (!snapshot) { res.status(404).json({ error: 'not found' }); return }
  const mime = ext === 'pgm' ? 'application/octet-stream'
    : ext === 'yaml' ? 'text/yaml'
    : 'image/png'
  res.setHeader('Content-Type', mime)
  res.setHeader('Content-Disposition', `attachment; filename="${snapshot.name}.${ext}"`)
  res.sendFile(getSnapshotPath(id, ext))
}

export async function setCurrentSnapshot(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const snapshot = await prisma.mapSnapshot.findUnique({ where: { id } })
  if (!snapshot) { res.status(404).json({ error: 'not found' }); return }
  await prisma.$transaction([
    prisma.mapSnapshot.updateMany({ where: { robotId: snapshot.robotId }, data: { isCurrent: false } }),
    prisma.mapSnapshot.update({ where: { id }, data: { isCurrent: true } }),
  ])
  res.status(200).json({ ok: true, snapshotId: id })
}
