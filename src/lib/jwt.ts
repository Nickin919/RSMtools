import jwt from 'jsonwebtoken'

const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d'

export interface JwtPayload {
  userId: string
  email: string | null
  role: string
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters')
  }
  return secret
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getSecret()) as JwtPayload
  return decoded
}
