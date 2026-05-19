import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'

/**
 * GET /api/points
 * Liste tous les points nommes du batiment.
 */
export async function listPoints(_req: Request, res: Response) {
  const points = await prisma.point.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { objects: true },
      },
    },
  })
  res.json({ data: points })
}

/**
 * GET /api/points/:id
 * Detail d'un point avec ses objets.
 */
export async function getPoint(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const point = await prisma.point.findUnique({
    where: { id },
    include: { objects: true },
  })

  if (!point) {
    res.status(404).json({ error: 'Point introuvable' })
    return
  }

  res.json({ data: point })
}

// Validation pour creation/modification
const pointSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  slug: z.string().min(1, 'Le slug est requis').regex(/^[a-z0-9-]+$/, 'Le slug ne doit contenir que des minuscules, chiffres et tirets'),
  x: z.number(),
  y: z.number(),
  theta: z.number().default(0),
  description: z.string().optional(),
})

/**
 * POST /api/points (admin only)
 * Cree un nouveau point.
 */
export async function createPoint(req: Request, res: Response) {
  const parsed = pointSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees invalides', details: parsed.error.issues })
    return
  }

  const point = await prisma.point.create({ data: parsed.data })
  res.status(201).json({ data: point })
}

/**
 * PUT /api/points/:id (admin only)
 * Modifie un point existant.
 */
export async function updatePoint(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const parsed = pointSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees invalides', details: parsed.error.issues })
    return
  }

  const point = await prisma.point.update({
    where: { id },
    data: parsed.data,
  })

  res.json({ data: point })
}

/**
 * DELETE /api/points/:id (admin only)
 * Supprime un point. Refuse si des missions (meme terminees) y sont liees :
 * la cle etrangere Mission.fromPointId/toPointId l'interdit et on conserve
 * l'integrite de l'historique des missions.
 */
export async function deletePoint(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  // Compter TOUTES les missions liees (pas seulement les actives) : une
  // mission terminee reference toujours le point via une cle etrangere,
  // donc la suppression echouerait avec une erreur de contrainte.
  const linkedMissions = await prisma.mission.count({
    where: { OR: [{ fromPointId: id }, { toPointId: id }] },
  })

  if (linkedMissions > 0) {
    res.status(400).json({
      error: 'Impossible de supprimer : ce point est lie a des missions (historique compris)',
      linkedMissions,
    })
    return
  }

  try {
    await prisma.point.delete({ where: { id } })
    res.status(204).send()
  } catch (e) {
    // Filet de securite : autre contrainte (objets lies) ou point absent
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2003') {
        res.status(400).json({
          error: 'Ce point est reference ailleurs et ne peut pas etre supprime',
        })
        return
      }
      if (e.code === 'P2025') {
        res.status(404).json({ error: 'Point introuvable' })
        return
      }
    }
    throw e
  }
}
