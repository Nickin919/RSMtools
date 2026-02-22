import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { authorize } from '../lib/roles'
import { uploadCSV } from '../middleware/upload'
import { importCatalog, importProducts, getCatalogInfo } from '../controllers/productImport.controller'

const router = Router()

router.use(authenticate)

router.get('/catalog-info', authorize('ADMIN', 'RSM'), getCatalogInfo)
router.post('/import', authorize('ADMIN', 'RSM'), uploadCSV, importCatalog)
router.post('/import-products', authorize('ADMIN', 'RSM'), importProducts)

export default router
