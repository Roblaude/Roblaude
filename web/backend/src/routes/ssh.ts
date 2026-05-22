import { Router } from 'express'
import { adminGuard } from '../middleware/auth'
import { execAllowlist, readLogs, listAuditLogs } from '../controllers/sshController'

// SSH admin routes (T3.5.12). Toutes sous /api/admin/ssh derriere authGuard+adminGuard.

const router = Router()
router.use(adminGuard)
router.post('/exec', execAllowlist)
router.get('/audit', listAuditLogs)
router.get('/robots/:id/logs', readLogs)

export default router
