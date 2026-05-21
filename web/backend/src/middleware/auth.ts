import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Pas de valeur par defaut : un secret en dur dans le code serait public
// (visible sur GitHub) et permettrait de forger des tokens. Si la variable
// est absente, le serveur refuse de demarrer.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error(
      'JWT_SECRET manquant. Definis-le dans web/backend/.env ' +
      '(genere une cle avec : openssl rand -base64 32)'
    )
  }
  return secret
}

const JWT_SECRET = getJwtSecret()

export interface JwtPayload {
  userId: number
  email: string
  role: string
}

// Etend Request pour ajouter le user decode
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

/**
 * authGuard — verifie que le token JWT est present et valide.
 * Si valide, ajoute req.user avec le payload decode.
 * Si absent/invalide → 401.
 */
export function authGuard(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token manquant' })
    return
  }

  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Token invalide ou expire' })
  }
}

/**
 * adminGuard — verifie que le user a le role ADMIN.
 * A utiliser APRES authGuard.
 */
export function adminGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acces reserve aux administrateurs' })
    return
  }
  next()
}

/**
 * Signe un JWT pour un user donne. Expire en 7 jours.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}
