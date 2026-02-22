import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes'

function validateEnv() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required')
  }
  const secret = process.env.JWT_SECRET
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
}

validateEnv()

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api', routes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal server error' })
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
