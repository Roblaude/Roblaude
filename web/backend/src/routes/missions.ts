import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listMissions, createMission } from '../controllers/missionsController'

const router = Router()

// GET /api/missions?status=PENDING&type=TRANSPORT&page=1&limit=20
router.get('/', asyncHandler(listMissions))

// POST /api/missions
router.post('/', asyncHandler(createMission))

export default router
