import { Router } from 'express'
import authRoutes from './auth.routes'

const router = Router()

router.use('/auth', authRoutes)

// Future: router.use('/price-contracts', priceContractRoutes)
// Future: router.use('/product-import', productImportRoutes)
// Future: router.use('/catalogs', catalogRoutes)

export default router
