import { Router } from 'express'
import {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from '../controllers/annotationsController'

const router = Router()
router.get('/', listAnnotations)
router.post('/', createAnnotation)
router.patch('/:id', updateAnnotation)
router.delete('/:id', deleteAnnotation)

export default router
