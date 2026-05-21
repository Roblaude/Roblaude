import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { authGuard, adminGuard } from '../middleware/auth'
import { register, login, me } from '../controllers/authController'

const router = Router()

// POST /api/auth/register — reserve aux admins (un robot en ERP ne doit
// pas avoir d'inscription publique). L'admin initial vient du seed Prisma.
router.post('/register', authGuard, adminGuard, asyncHandler(register))

// POST /api/auth/login — se connecter
router.post('/login', asyncHandler(login))

// GET /api/auth/me — profil du user connecte (protege)
router.get('/me', authGuard, asyncHandler(me))

export default router
