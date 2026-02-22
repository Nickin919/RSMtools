import crypto from 'crypto'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes'

function validateEnv() {
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (!dbUrl) {
    console.error('[Startup] DATABASE_URL is missing. In Railway: add a Postgres database, then in your service Variables add DATABASE_URL (reference the Postgres service variable).')
    throw new Error('DATABASE_URL is required')
  }
  let secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32).toString('hex')
    process.env.JWT_SECRET = secret
    console.warn('')
    console.warn('*** WARNING: JWT_SECRET was not set or was shorter than 32 characters. ***')
    console.warn('*** Using a temporary secret for this run. Set JWT_SECRET in Railway → Service → Variables (32+ chars) and redeploy. ***')
    console.warn('*** Until then, login tokens will reset on every deploy. ***')
    console.warn('')
  } else {
    process.env.JWT_SECRET = secret
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
