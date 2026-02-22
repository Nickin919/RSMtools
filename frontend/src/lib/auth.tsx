import React, { createContext, useContext, useState, useEffect } from 'react'

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
}

const TOKEN_KEY = 'rsm-tools-token'

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

const AuthContext = createContext<{
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email?: string; password?: string; firstName?: string; lastName?: string }) => Promise<void>
  logout: () => void
} | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data.user ?? data))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Login failed')
    }
    const data = await res.json()
    setToken(data.token)
    setUser(data.user ?? data)
  }

  const register = async (data: {
    email?: string
    password?: string
    firstName?: string
    lastName?: string
  }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Registration failed')
    }
    const out = await res.json()
    setToken(out.token)
    setUser(out.user ?? out)
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token: getToken(),
        loading,
        login,
        register,
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
