import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

// middleware réutilisable — valide req.body contre un schéma Zod
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: 'Données invalides',
        details: result.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      })
      return
    }
    req.body = result.data
    next()
  }
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      res.status(400).json({
        error: 'Paramètres invalides',
        details: result.error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      })
      return
    }
    // cast nécessaire : Zod retourne un type générique, Express attend ParsedQs
    req.query = result.data as typeof req.query
    next()
  }
}
