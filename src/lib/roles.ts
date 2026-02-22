import { Request, Response, NextFunction } from 'express'

export type UserRole =
  | 'FREE'
  | 'BASIC'
  | 'TURNKEY'
  | 'DISTRIBUTOR'
  | 'RSM'
  | 'ADMIN'
  | 'DISTRIBUTOR_REP'
  | 'DIRECT_USER'
  | 'BASIC_USER'

export interface AuthUser {
  id: string
  email: string | null
  role: UserRole
  isActive: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }
    if (!req.user.isActive) {
      return res.status(401).json({ message: 'Account is inactive' })
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }
    next()
  }
}
