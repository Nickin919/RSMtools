import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { uploadMultiplePDFs } from '../middleware/upload'
import {
  listContracts,
  createContract,
  getContract,
  renameContract,
  deleteContract,
  uploadPDFsToContract,
  batchUploadPDFs,
  updateContractItem,
  recheckAllItems,
  bulkApplySellPrice,
  bulkApplyMoq,
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
router.patch('/:id', renameContract)
router.delete('/:id', deleteContract)
router.post('/:id/items/upload-pdfs', uploadMultiplePDFs, uploadPDFsToContract)
router.post('/:id/recheck-all', recheckAllItems)
router.post('/:id/items/bulk-sell-price', bulkApplySellPrice)
router.post('/:id/items/bulk-moq', bulkApplyMoq)
router.patch('/:id/items/:itemId', updateContractItem)
router.delete('/:id/items/:itemId', deleteContractItem)
router.get('/:id/download-csv', downloadContractCSV)

export default router
