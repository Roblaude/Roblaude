import { Router } from 'express'
import { adminGuard } from '../middleware/auth'
import { getHealth, runRepair } from '../controllers/repairController'

// Routes ops robot (admin) : sante + reparation. Montees sous /api/admin.

const router = Router()
router.use(adminGuard)
router.get('/robots/:id/health', getHealth)
router.post('/robots/:id/repair', runRepair)

export default router
