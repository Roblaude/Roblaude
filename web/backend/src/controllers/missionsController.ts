import { Request, Response } from 'express'
import { MissionStatus, MissionType, RobotStatus } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { robotMqtt } from '../services/mqtt'

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
}).refine(
  (d) => d.type !== MissionType.PICK_AND_PLACE || d.objectId !== undefined,
  { message: 'objectId est requis pour une mission pick & place', path: ['objectId'] },
)

export async function createMission(req: Request, res: Response) {
  // authGuard est en amont de cette route, mais on garde le check explicite
  // pour le typage et pour eviter tout user injection sur la mission.
  if (!req.user) {
    res.status(401).json({ error: 'Non authentifie' })
    return
  }

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

  // pick & place : l'objet doit exister (la cle etrangere echouerait sinon)
  if (objectId) {
    const object = await prisma.graspObject.findUnique({ where: { id: objectId } })
    if (!object) {
      res.status(400).json({ error: 'Objet introuvable', field: 'objectId' })
      return
    }
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
      userId: req.user.userId,
    },
    include: {
      fromPoint: true,
      toPoint: true,
      robot: { select: { id: true, name: true, status: true } },
      user: { select: { id: true, name: true, email: true } },
      object: true,
    },
  })

  // T4.2.2 — publie cmd/mission au robot si un robotId est present. Sans
  // robotId, la mission reste PENDING ; un assignment ulterieur publiera.
  // Payload conforme spec MQTT §5.1 (theta obligatoire dans les points,
  // objectId nullable pour TRANSPORT).
  if (mission.robotId) {
    robotMqtt.publishCommand(mission.robotId, 'mission', {
      missionId: mission.id,
      type: mission.type,
      fromPoint: { x: fromPoint.x, y: fromPoint.y, theta: fromPoint.theta, slug: fromPoint.slug },
      toPoint: { x: toPoint.x, y: toPoint.y, theta: toPoint.theta, slug: toPoint.slug },
      objectId: mission.objectId,
    })
  }

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

// Sentinels typees pour transporter une erreur depuis la transaction
type ResumeError = { code: 404 | 400; body: object }
function isResumeError(x: unknown): x is ResumeError {
  return typeof x === 'object' && x !== null && 'code' in x && 'body' in x
}

export async function resumeMission(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  // Tous les checks DANS la transaction pour eviter la race entre
  // findUnique et le robot.update (Copilot #218 — la mission peut etre
  // annulee ou son robot reassigne entre les deux).
  let robotIdForCommand: number
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findUnique({ where: { id } })
      if (!mission) throw { code: 404, body: { error: 'Mission introuvable' } } satisfies ResumeError
      if (mission.status !== MissionStatus.PAUSED) {
        throw { code: 400, body: { error: 'Mission non reprenable', status: mission.status } } satisfies ResumeError
      }
      if (!mission.robotId) {
        throw { code: 400, body: { error: 'Aucun robot assigne a la mission' } } satisfies ResumeError
      }

      await tx.robot.update({
        where: { id: mission.robotId },
        data: { status: RobotStatus.BUSY },
      })

      const reloaded = await tx.mission.findUnique({
        where: { id },
        include: {
          fromPoint: true,
          toPoint: true,
          robot: { select: { id: true, name: true, status: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      })
      // Theoriquement impossible (on vient de findUnique ci-dessus dans la
      // meme transaction), mais on garde-fou plutot que renvoyer 200 + null.
      if (!reloaded) throw { code: 404, body: { error: 'Mission disparue en cours de transaction' } } satisfies ResumeError

      robotIdForCommand = mission.robotId
      return reloaded
    })

    // Publish APRES commit reussi (sinon on commande au robot pour rien)
    robotMqtt.publishCommand(robotIdForCommand!, 'resume', { missionId: id })
    res.json({ data: updated })
  } catch (err) {
    if (isResumeError(err)) {
      res.status(err.code).json(err.body)
      return
    }
    throw err
  }
}

// états depuis lesquels on peut emergency-stop (en gros tout ce qui est actif)
const STOPPABLE_STATUSES: MissionStatus[] = [
  MissionStatus.PENDING,
  MissionStatus.PAUSED,
  MissionStatus.NAVIGATING_TO_PICKUP,
  MissionStatus.WAITING_FOR_LOAD,
  MissionStatus.NAVIGATING_TO_DESTINATION,
  MissionStatus.DETECTING_OBJECT,
  MissionStatus.GRASPING,
  MissionStatus.TRANSPORTING,
  MissionStatus.DEPOSITING,
]

// T4.2.6 — arret d'urgence. Publie cmd/emergency-stop et passe la mission
// en CANCELLED. Le robot lui-meme republiera un mission/result cancelled
// quand il aura effectivement stoppe (status terrain fait foi).
export async function stopMission(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'user-pressed-stop'

  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) {
    res.status(404).json({ error: 'Mission introuvable' })
    return
  }
  if (!STOPPABLE_STATUSES.includes(mission.status)) {
    res.status(400).json({ error: 'Mission non arretable', status: mission.status })
    return
  }
  if (!mission.robotId) {
    res.status(400).json({ error: 'Aucun robot assigne a la mission' })
    return
  }

  // Update local + libere robot. Le robot republiera son etat reel via
  // mission/result quand il aura stoppe — ca ecrasera notre CANCELLED si
  // necessaire.
  const updated = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.mission.update({
      where: { id },
      data: { status: MissionStatus.CANCELLED, failureReason: reason },
      include: {
        fromPoint: true,
        toPoint: true,
        robot: { select: { id: true, name: true, status: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    await tx.robot.update({
      where: { id: mission.robotId! },
      data: { status: RobotStatus.AVAILABLE },
    })
    return cancelled
  })

  // emergency-stop est GLOBAL (spec §5.1 — pas de missionId, le robot arrete
  // ce qu'il fait quoi qu'il arrive). On garde reason pour traçabilité.
  robotMqtt.publishCommand(mission.robotId, 'emergency-stop', { reason })

  res.json({ data: updated })
}

// T4.2.8 — l'utilisateur confirme depuis l'UI que la charge est faite.
// Publie cmd/loading-confirmed. Le robot reprendra et republiera
// mission/status quand il bouge vers la destination.
export async function confirmLoadingMission(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) {
    res.status(404).json({ error: 'Mission introuvable' })
    return
  }
  if (mission.status !== MissionStatus.WAITING_FOR_LOAD) {
    res.status(400).json({
      error: 'Mission pas en attente de chargement',
      status: mission.status,
    })
    return
  }
  if (!mission.robotId) {
    res.status(400).json({ error: 'Aucun robot assigne a la mission' })
    return
  }

  robotMqtt.publishCommand(mission.robotId, 'loading-confirmed', {
    missionId: id,
  })

  // On ne change PAS mission.status ici : le robot publiera son sous-etat
  // suivant (NAVIGATING_TO_DESTINATION) via mission/status apres reception.
  const refreshed = await prisma.mission.findUnique({
    where: { id },
    include: {
      fromPoint: true,
      toPoint: true,
      robot: { select: { id: true, name: true, status: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })
  res.json({ data: refreshed })
}
