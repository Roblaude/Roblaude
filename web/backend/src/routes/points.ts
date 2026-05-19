import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { adminGuard } from '../middleware/auth'
import { listPoints, getPoint, createPoint, updatePoint, deletePoint } from '../controllers/pointsController'

const router = Router()

// GET /api/points — liste (tous les users connectes)
router.get('/', asyncHandler(listPoints))

// GET /api/points/:id — detail
router.get('/:id', asyncHandler(getPoint))

// POST /api/points — creer (admin only)
router.post('/', adminGuard, asyncHandler(createPoint))

// PUT /api/points/:id — modifier (admin only)
router.put('/:id', adminGuard, asyncHandler(updatePoint))

// DELETE /api/points/:id — supprimer (admin only)
router.delete('/:id', adminGuard, asyncHandler(deletePoint))

export default router
