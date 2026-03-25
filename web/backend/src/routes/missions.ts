import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listMissions, createMission, cancelMission } from '../controllers/missionsController'

const router = Router()

// GET /api/missions?status=PENDING&type=TRANSPORT&page=1&limit=20
router.get('/', asyncHandler(listMissions))

// POST /api/missions
router.post('/', asyncHandler(createMission))

// POST /api/missions/:id/cancel
router.post('/:id/cancel', asyncHandler(cancelMission))

export default router
