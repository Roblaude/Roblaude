import { Request, Response } from 'express'
import prisma from '../lib/prisma'

/**
 * GET /api/robots
 * Liste tous les robots.
 */
export async function listRobots(_req: Request, res: Response) {
  const robots = await prisma.robot.findMany({
    orderBy: { id: 'asc' },
  })
  res.json({ data: robots })
}

/**
 * GET /api/robots/:id/status
 * Retourne le status d'un robot (position, batterie, etat).
 * Pour l'instant donnees en DB, les vraies viendront via MQTT au Sprint 4.
 */
export async function getRobotStatus(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const robot = await prisma.robot.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      positionX: true,
      positionY: true,
      heading: true,
      battery: true,
    },
  })

  if (!robot) {
    res.status(404).json({ error: 'Robot introuvable' })
    return
  }

  res.json({ data: robot })
}
