import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { uploadMultiplePDFs } from '../middleware/upload'
import {
  listContracts,
  createContract,
  getContract,
  deleteContract,
  uploadPDFsToContract,
  batchUploadPDFs,
  downloadContractCSV,
  deleteContractItem,
} from '../controllers/priceContract.controller'

const router = Router()

router.use(authenticate)

router.get('/', listContracts)
router.post('/', createContract)

// batch-upload must be before /:id to avoid collision
router.post('/batch-upload', uploadMultiplePDFs, batchUploadPDFs)

router.get('/:id', getContract)
router.delete('/:id', deleteContract)

router.post('/:id/items/upload-pdfs', uploadMultiplePDFs, uploadPDFsToContract)
router.get('/:id/download-csv', downloadContractCSV)
router.delete('/:id/items/:itemId', deleteContractItem)

export default router
