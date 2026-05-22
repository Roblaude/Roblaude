import { Router } from 'express'
import {
  startMapping,
  stopMapping,
  saveMapping,
  listSessions,
  getSession,
  downloadSnapshot,
  setCurrentSnapshot,
} from '../controllers/mappingController'
import { adminGuard } from '../middleware/auth'

// Toutes les routes sont derriere authGuard (cf. app.ts).
// adminGuard supplementaire sur set-current : changement de carte courante = admin.

const router = Router()

router.post('/start', startMapping)
router.post('/stop', stopMapping)
router.post('/save', saveMapping)
router.get('/sessions', listSessions)
router.get('/sessions/:id', getSession)
router.get('/snapshots/:id/download.:ext', downloadSnapshot)
router.post('/snapshots/:id/set-current', adminGuard, setCurrentSnapshot)

export default router
