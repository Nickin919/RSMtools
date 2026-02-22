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
  updateContractItem,
  deleteContractItem,
  downloadContractCSV,
} from '../controllers/priceContract.controller'

const router = Router()
router.use(authenticate)

router.get('/', listContracts)
router.post('/', createContract)

// Must be before /:id to avoid param collision
router.post('/batch-upload', uploadMultiplePDFs, batchUploadPDFs)

router.get('/:id', getContract)
router.delete('/:id', deleteContract)
router.post('/:id/items/upload-pdfs', uploadMultiplePDFs, uploadPDFsToContract)
router.patch('/:id/items/:itemId', updateContractItem)
router.delete('/:id/items/:itemId', deleteContractItem)
router.get('/:id/download-csv', downloadContractCSV)

export default router
