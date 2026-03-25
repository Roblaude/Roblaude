import { Request, Response } from 'express'
import { MissionStatus } from '@prisma/client'
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
