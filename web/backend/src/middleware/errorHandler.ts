import { Request, Response, NextFunction } from 'express'
import { PrismaClientKnownRequestError, PrismaClientInitializationError } from '@prisma/client/runtime/library'

// format d'erreur uniforme pour toute l'API
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // erreurs Prisma courantes
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Ressource introuvable' })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Cette valeur existe déjà' })
      return
    }
  }

  // erreur de connexion DB
  if (err instanceof PrismaClientInitializationError) {
    console.error('[DB] connexion impossible:', (err as Error).message)
    res.status(503).json({ error: 'Base de données indisponible' })
    return
  }

  // erreur générique — pas de stack trace en prod
  if (err instanceof Error) {
    console.error('[ERROR]', err.message)
    res.status(500).json({
      error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : err.message,
    })
    return
  }

  res.status(500).json({ error: 'Erreur interne' })
}

// wrapper pour éviter try/catch dans chaque controller
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
