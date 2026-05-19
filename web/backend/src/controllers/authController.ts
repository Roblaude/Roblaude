import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod/v4'
import prisma from '../lib/prisma'
import { signToken } from '../middleware/auth'

// Schemas de validation
const registerSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit faire au moins 6 caracteres'),
  name: z.string().min(1, 'Le nom est requis'),
})

const loginSchema = z.object({
  email: z.email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

/**
 * POST /api/auth/register
 * Cree un nouvel utilisateur avec password hashe et retourne un JWT.
 */
export async function register(req: Request, res: Response) {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Validation echouee', details: result.error.issues })
    return
  }

  const { email, password, name } = result.data

  // Verifier que l'email n'est pas deja pris
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Cet email est deja utilise' })
    return
  }

  // Hasher le password (10 rounds de salt)
  const hashedPassword = await bcrypt.hash(password, 10)

  // Creer le user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
    },
  })

  // Generer le JWT
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  })

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  })
}

/**
 * POST /api/auth/login
 * Verifie email + password et retourne un JWT.
 */
export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Validation echouee', details: result.error.issues })
    return
  }

  const { email, password } = result.data

  // Chercher le user
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    return
  }

  // Verifier le password
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    return
  }

  // Generer le JWT
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  })

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  })
}

/**
 * GET /api/auth/me
 * Retourne le profil du user connecte (necessite authGuard).
 */
export async function me(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Non authentifie' })
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  })

  if (!user) {
    res.status(404).json({ error: 'Utilisateur introuvable' })
    return
  }

  res.json({ user })
}
