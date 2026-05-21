import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listMissions, getMission, createMission, cancelMission, resumeMission } from '../controllers/missionsController'

const router = Router()

// GET /api/missions?status=PENDING&type=TRANSPORT&page=1&limit=20
router.get('/', asyncHandler(listMissions))

// GET /api/missions/:id — detail d'une mission
router.get('/:id', asyncHandler(getMission))

// POST /api/missions
router.post('/', asyncHandler(createMission))

// POST /api/missions/:id/cancel
router.post('/:id/cancel', asyncHandler(cancelMission))

// POST /api/missions/:id/resume — relance une mission PAUSED
router.post('/:id/resume', asyncHandler(resumeMission))

export default router
