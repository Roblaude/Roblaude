import { Request, Response } from 'express'
import { MissionStatus, MissionType, RobotStatus } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'

// query params pour GET /api/missions
const listQuerySchema = z.object({
  status: z.nativeEnum(MissionStatus).optional(),
  type: z.enum(['TRANSPORT', 'PICK_AND_PLACE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function listMissions(req: Request, res: Response) {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Paramètres invalides',
      details: parsed.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }

  const { status, type, page, limit } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
  }

  const [missions, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        fromPoint: true,
        toPoint: true,
        robot: { select: { id: true, name: true, status: true } },
        user: { select: { id: true, name: true, email: true } },
        object: true,
      },
    }),
    prisma.mission.count({ where }),
  ])

  res.json({
    data: missions,
    total,
    page,
    limit,
  })
}

export async function getMission(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const mission = await prisma.mission.findUnique({
    where: { id },
    include: {
      fromPoint: true,
      toPoint: true,
      robot: { select: { id: true, name: true, status: true, battery: true, positionX: true, positionY: true } },
      user: { select: { id: true, name: true, email: true } },
      object: true,
    },
  })

  if (!mission) {
    res.status(404).json({ error: 'Mission introuvable' })
    return
  }

  res.json({ data: mission })
}

// body pour POST /api/missions
const createMissionSchema = z.object({
  type: z.nativeEnum(MissionType),
  fromPointId: z.number().int().positive(),
  toPointId: z.number().int().positive(),
  robotId: z.number().int().positive().optional(),
  objectId: z.number().int().positive().optional(),
  // todo: userId viendra du token JWT — hardcodé à 1 pour l'instant
})

export async function createMission(req: Request, res: Response) {
  const parsed = createMissionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Données invalides',
      details: parsed.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }

  const { type, fromPointId, toPointId, robotId, objectId } = parsed.data

  // vérifier que les points existent
  const [fromPoint, toPoint] = await Promise.all([
    prisma.point.findUnique({ where: { id: fromPointId } }),
    prisma.point.findUnique({ where: { id: toPointId } }),
  ])

  if (!fromPoint) {
    res.status(400).json({ error: 'Point de départ introuvable', field: 'fromPointId' })
    return
  }
  if (!toPoint) {
    res.status(400).json({ error: 'Point d\'arrivée introuvable', field: 'toPointId' })
    return
  }

  // vérifier que le robot est dispo si précisé
  if (robotId) {
    const robot = await prisma.robot.findUnique({ where: { id: robotId } })
    if (!robot) {
      res.status(400).json({ error: 'Robot introuvable', field: 'robotId' })
      return
    }
    if (robot.status === RobotStatus.BUSY) {
      res.status(409).json({ error: 'Robot occupé', status: robot.status })
      return
    }
  }

  const mission = await prisma.mission.create({
    data: {
      type,
      fromPointId,
      toPointId,
      robotId: robotId ?? null,
      objectId: objectId ?? null,
      userId: req.user?.userId ?? 1,
    },
    include: {
      fromPoint: true,
      toPoint: true,
      robot: { select: { id: true, name: true, status: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })

  res.status(201).json({ data: mission })
}

// états depuis lesquels on peut annuler
const CANCELLABLE_STATUSES: MissionStatus[] = [
  MissionStatus.PENDING,
  MissionStatus.PAUSED,
  MissionStatus.NAVIGATING_TO_PICKUP,
  MissionStatus.WAITING_FOR_LOAD,
  MissionStatus.NAVIGATING_TO_DESTINATION,
]

export async function cancelMission(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const mission = await prisma.mission.findUnique({
    where: { id },
    include: { robot: true },
  })

  if (!mission) {
    res.status(404).json({ error: 'Mission introuvable' })
    return
  }

  if (!CANCELLABLE_STATUSES.includes(mission.status)) {
    res.status(400).json({
      error: 'Mission non annulable',
      status: mission.status,
    })
    return
  }

  // transaction : annuler la mission + libérer le robot si assigné
  const updated = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.mission.update({
      where: { id },
      data: { status: MissionStatus.CANCELLED },
      include: {
        fromPoint: true,
        toPoint: true,
        robot: { select: { id: true, name: true, status: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (mission.robotId) {
      await tx.robot.update({
        where: { id: mission.robotId },
        data: { status: RobotStatus.AVAILABLE },
      })
    }

    return cancelled
  })

  res.json({ data: updated })
}
