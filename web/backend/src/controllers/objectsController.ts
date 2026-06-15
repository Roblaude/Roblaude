import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'

/**
 * GET /api/objects
 * Liste les objets saisissables avec leur emplacement.
 */
export async function listObjects(_req: Request, res: Response) {
  const objects = await prisma.graspObject.findMany({
    orderBy: { name: 'asc' },
    include: { location: { select: { id: true, name: true, slug: true } } },
  })
  res.json({ data: objects })
}

/**
 * GET /api/objects/:id
 * Detail d'un objet avec son emplacement.
 */
export async function getObject(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const object = await prisma.graspObject.findUnique({
    where: { id },
    include: { location: true },
  })

  if (!object) {
    res.status(404).json({ error: 'Objet introuvable' })
    return
  }

  res.json({ data: object })
}

// Validation pour creation/modification
const objectSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  imageUrl: z.string().optional(),
  // hex pour la detection vision (le robot en derive la plage HSV)
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex attendue (#rrggbb)').optional(),
  available: z.boolean().default(true),
  locationId: z.number().int().positive("L'emplacement est requis"),
})

/**
 * POST /api/objects (admin only)
 * Cree un nouvel objet saisissable.
 */
export async function createObject(req: Request, res: Response) {
  const parsed = objectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees invalides', details: parsed.error.issues })
    return
  }

  // l'emplacement doit exister, sinon la cle etrangere echouerait avec une 500
  const point = await prisma.point.findUnique({ where: { id: parsed.data.locationId } })
  if (!point) {
    res.status(400).json({ error: 'Emplacement introuvable' })
    return
  }

  const object = await prisma.graspObject.create({ data: parsed.data })
  res.status(201).json({ data: object })
}

/**
 * PUT /api/objects/:id (admin only)
 * Modifie un objet existant.
 */
export async function updateObject(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const parsed = objectSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Donnees invalides', details: parsed.error.issues })
    return
  }

  if (parsed.data.locationId !== undefined) {
    const point = await prisma.point.findUnique({ where: { id: parsed.data.locationId } })
    if (!point) {
      res.status(400).json({ error: 'Emplacement introuvable' })
      return
    }
  }

  const object = await prisma.graspObject.update({
    where: { id },
    data: parsed.data,
  })

  res.json({ data: object })
}

/**
 * DELETE /api/objects/:id (admin only)
 * Refuse si des missions referencent l'objet : on conserve l'historique.
 */
export async function deleteObject(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const linkedMissions = await prisma.mission.count({ where: { objectId: id } })
  if (linkedMissions > 0) {
    res.status(400).json({
      error: 'Impossible de supprimer : cet objet est lie a des missions (historique compris)',
      linkedMissions,
    })
    return
  }

  try {
    await prisma.graspObject.delete({ where: { id } })
    res.status(204).send()
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2003') {
        res.status(400).json({
          error: 'Cet objet est reference ailleurs et ne peut pas etre supprime',
        })
        return
      }
      if (e.code === 'P2025') {
        res.status(404).json({ error: 'Objet introuvable' })
        return
      }
    }
    throw e
  }
}
