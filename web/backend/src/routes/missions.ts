import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import {
  listMissions,
  getMission,
  createMission,
  createDemoMission,
  cancelMission,
  resumeMission,
  stopMission,
  confirmLoadingMission,
} from '../controllers/missionsController'

const router = Router()

// GET /api/missions?status=PENDING&type=TRANSPORT&page=1&limit=20
router.get('/', asyncHandler(listMissions))

// POST /api/missions/demo — mission pick & place preset en 1 clic (soutenance)
router.post('/demo', asyncHandler(createDemoMission))

// GET /api/missions/:id — detail d'une mission
router.get('/:id', asyncHandler(getMission))

// POST /api/missions
router.post('/', asyncHandler(createMission))

// POST /api/missions/:id/cancel — annulation logique (mission PENDING/active)
router.post('/:id/cancel', asyncHandler(cancelMission))

// POST /api/missions/:id/resume — relance une mission PAUSED
router.post('/:id/resume', asyncHandler(resumeMission))

// POST /api/missions/:id/stop — arret d'urgence (cmd/emergency-stop au robot)
router.post('/:id/stop', asyncHandler(stopMission))

// POST /api/missions/:id/confirm-loading — l'user confirme la charge (cmd/loading-confirmed)
router.post('/:id/confirm-loading', asyncHandler(confirmLoadingMission))

export default router
