import { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../lib/jwt'

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = verifyToken(token)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    })
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
