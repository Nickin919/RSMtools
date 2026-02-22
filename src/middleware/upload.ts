import multer from 'multer'
import path from 'path'
import fs from 'fs'
import os from 'os'

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

const uploadBase = process.env.UPLOAD_DIR ?? path.join(os.tmpdir(), 'rsm-uploads')

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadBase, 'pdf')
    ensureDir(dir)
    cb(null, dir)
  },
  filename: (_req, _file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    cb(null, `quote-${unique}.pdf`)
  },
})

const csvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadBase, 'csv')
    ensureDir(dir)
    cb(null, dir)
  },
  filename: (_req, _file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    cb(null, `catalog-${unique}.csv`)
  },
})

export const uploadPDF = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  },
}).single('pdf')

export const uploadMultiplePDFs = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  },
}).array('pdf', 10)

export const uploadCSV = multer({
  storage: csvStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv')
    if (ok) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are allowed'))
    }
  },
}).single('file')
