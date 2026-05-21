import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listRobots, getRobotStatus } from '../controllers/robotsController'
import { getMapMetadata, getMapImage } from '../controllers/mapController'

const router = Router()

// GET /api/robots — liste
router.get('/', asyncHandler(listRobots))

// GET /api/robots/:id/status — status d'un robot
router.get('/:id/status', asyncHandler(getRobotStatus))

// GET /api/robots/:id/map — metadata carte SLAM (resolution, origin, url image)
router.get('/:id/map', asyncHandler(getMapMetadata))

// GET /api/robots/:id/map.png — image PNG de la carte (cache 30s)
router.get('/:id/map.png', asyncHandler(getMapImage))

export default router
