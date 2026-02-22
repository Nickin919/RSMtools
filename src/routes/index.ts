import { Router } from 'express'
import authRoutes from './auth.routes'
import productImportRoutes from './productImport.routes'
import priceContractRoutes from './priceContract.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/product-import', productImportRoutes)
router.use('/price-contracts', priceContractRoutes)

export default router
