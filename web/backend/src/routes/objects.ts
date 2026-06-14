import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler'
import { adminGuard } from '../middleware/auth'
import { listObjects, getObject, createObject, updateObject, deleteObject } from '../controllers/objectsController'

const router = Router()

// GET /api/objects — liste (tous les users connectes)
router.get('/', asyncHandler(listObjects))

// GET /api/objects/:id — detail
router.get('/:id', asyncHandler(getObject))

// POST /api/objects — creer (admin only)
router.post('/', adminGuard, asyncHandler(createObject))

// PUT /api/objects/:id — modifier (admin only)
router.put('/:id', adminGuard, asyncHandler(updateObject))

// DELETE /api/objects/:id — supprimer (admin only)
router.delete('/:id', adminGuard, asyncHandler(deleteObject))

export default router
