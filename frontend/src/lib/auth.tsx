import React, { createContext, useContext, useState, useEffect } from 'react'
import { api, getToken, setToken, clearToken, CLIENT_APP } from './api'

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

export interface User {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  role: UserRole
  appSource?: string
}

const AuthContext = createContext<{
  user: User | null
  token: string | null
  loading: boolean
  /** True when continuing without an account — no server saves */
  isGuest: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>
  loginAsGuest: () => void
  logout: () => void
} | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const guestFlag = sessionStorage.getItem('rsm-tools-guest')
    if (guestFlag === '1') {
      setUser({ id: 'guest', email: null, firstName: null, lastName: null, role: 'FREE' })
      setIsGuest(true)
      setLoading(false)
      return
    }

    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api<{ user?: User } & User>('/auth/me')
      .then((data) => {
        const u = (data as { user?: User }).user ?? (data as User)
        setUser(u)
        setIsGuest(false)
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const data = await api<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      json: { email, password, clientApp: CLIENT_APP },
    })
    sessionStorage.removeItem('rsm-tools-guest')
    setToken(data.token)
    setUser(data.user)
    setIsGuest(false)
  }

  const register = async (data: {
    email: string
    password: string
    firstName?: string
    lastName?: string
  }) => {
    const out = await api<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      json: { ...data, clientApp: CLIENT_APP },
    })
    sessionStorage.removeItem('rsm-tools-guest')
    setToken(out.token)
    setUser(out.user)
    setIsGuest(false)
  }

  const loginAsGuest = () => {
    clearToken()
    sessionStorage.setItem('rsm-tools-guest', '1')
    setUser({ id: 'guest', email: null, firstName: null, lastName: null, role: 'FREE' })
    setIsGuest(true)
  }

  const logout = () => {
    clearToken()
    sessionStorage.removeItem('rsm-tools-guest')
    setUser(null)
    setIsGuest(false)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token: getToken(),
        loading,
        isGuest,
        login,
        register,
        loginAsGuest,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
