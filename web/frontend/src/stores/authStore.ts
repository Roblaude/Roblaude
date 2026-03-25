import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: number
  email: string
  name: string
  role: 'USER' | 'ADMIN'
}

interface AuthStore {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const API = '/api'

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      loading: false,
      error: null,

      login: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) {
            const err = await res.json() as { error: string }
            throw new Error(err.error)
          }
          const json = await res.json() as { user: User; token: string }
          set({ user: json.user, token: json.token })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Erreur connexion' })
          throw e
        } finally {
          set({ loading: false })
        }
      },

      register: async (email, password, name) => {
        set({ loading: true, error: null })
        try {
          const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
          })
          if (!res.ok) {
            const err = await res.json() as { error: string }
            throw new Error(err.error)
          }
          const json = await res.json() as { user: User; token: string }
          set({ user: json.user, token: json.token })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Erreur inscription' })
          throw e
        } finally {
          set({ loading: false })
        }
      },

      logout: () => set({ user: null, token: null, error: null }),
    }),
    { name: 'roblaude-auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)
