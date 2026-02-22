import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'
import { generateToken } from '../lib/jwt'

const MIN_PASSWORD_LENGTH = 8
const BCRYPT_ROUNDS = 10

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function sanitizeUser(user: { id: string; email: string | null; firstName: string | null; lastName: string | null; role: string }) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  }
}

export async function register(req: Request, res: Response) {
  try {
    const { email, password, firstName, lastName, role } = req.body ?? {}

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' })
    }
    const emailTrimmed = email.trim()
    if (!emailRegex.test(emailTrimmed)) {
      return res.status(400).json({ message: 'Invalid email format' })
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' })
    }

    const existing = await prisma.user.findUnique({ where: { email: emailTrimmed } })
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        email: emailTrimmed,
        passwordHash,
        firstName: typeof firstName === 'string' ? firstName.trim() || null : null,
        lastName: typeof lastName === 'string' ? lastName.trim() || null : null,
        role: role && ['FREE', 'BASIC', 'TURNKEY', 'DISTRIBUTOR', 'RSM', 'ADMIN', 'DISTRIBUTOR_REP', 'DIRECT_USER', 'BASIC_USER'].includes(role) ? role : 'BASIC_USER',
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    })

    const token = generateToken({ userId: user.id, email: user.email, role: user.role })
    return res.status(201).json({ user: sanitizeUser(user), token })
  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ message: 'Registration failed' })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {}
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
    })
    if (!user || !user.passwordHash) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
    if (!user.isActive) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role })
    const sanitized = sanitizeUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    })
    return res.status(200).json({ user: sanitized, token })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ message: 'Login failed' })
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' })
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    })
    if (!user || !req.user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' })
    }
    return res.status(200).json({ user: sanitizeUser(user) })
  } catch (err) {
    console.error('Get current user error:', err)
    return res.status(500).json({ message: 'Failed to load user' })
  }
}
