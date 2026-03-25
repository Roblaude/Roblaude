import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listMissions } from '../controllers/missionsController'

const router = Router()

// GET /api/missions?status=PENDING&type=TRANSPORT&page=1&limit=20
router.get('/', asyncHandler(listMissions))

export default router
