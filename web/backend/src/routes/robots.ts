import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listRobots, getRobotStatus } from '../controllers/robotsController'

const router = Router()

// GET /api/robots — liste
router.get('/', asyncHandler(listRobots))

// GET /api/robots/:id/status — status d'un robot
router.get('/:id/status', asyncHandler(getRobotStatus))

export default router
