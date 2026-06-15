import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { listRobots, getRobotStatus } from '../controllers/robotsController'
import { getMapMetadata, getMapImage } from '../controllers/mapController'
import { commandArm, commandArmPreset, listArmPresets } from '../controllers/armController'

const router = Router()

// GET /api/robots — liste
router.get('/', asyncHandler(listRobots))

// GET /api/robots/:id/status — status d'un robot
router.get('/:id/status', asyncHandler(getRobotStatus))

// GET /api/robots/:id/map — metadata carte SLAM (resolution, origin, url image)
router.get('/:id/map', asyncHandler(getMapMetadata))

// GET /api/robots/:id/map.png — image PNG de la carte (cache 30s)
router.get('/:id/map.png', asyncHandler(getMapImage))

// POST /api/robots/:id/arm — commande bras 6-DOF (5 axes + pince joint6)
router.post('/:id/arm', asyncHandler(commandArm))

// GET /api/robots/arm/presets — liste des presets disponibles (startup, shutdown, vertical)
router.get('/arm/presets', listArmPresets)

// POST /api/robots/:id/arm/preset/:preset — applique un preset predefini
router.post('/:id/arm/preset/:preset', asyncHandler(commandArmPreset))

export default router
