import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { authGuard } from '../middleware/auth'
import { register, login, me } from '../controllers/authController'

const router = Router()

// POST /api/auth/register — creer un compte
router.post('/register', asyncHandler(register))

// POST /api/auth/login — se connecter
router.post('/login', asyncHandler(login))

// GET /api/auth/me — profil du user connecte (protege)
router.get('/me', authGuard, asyncHandler(me))

export default router
