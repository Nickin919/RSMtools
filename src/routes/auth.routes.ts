import { Router } from 'express'
import { register, login, loginAsGuest, getCurrentUser } from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/guest', loginAsGuest)
router.get('/me', authenticate, getCurrentUser)

export default router
