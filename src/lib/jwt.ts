import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET
const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d'

export interface JwtPayload {
  userId: string
  email: string | null
  role: string
}

export function generateToken(payload: JwtPayload): string {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
  const decoded = jwt.verify(token, secret) as JwtPayload
  return decoded
}
