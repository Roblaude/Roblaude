import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export type MissionStatus =
  | 'PENDING' | 'NAVIGATING_TO_PICKUP' | 'WAITING_FOR_LOAD'
  | 'NAVIGATING_TO_DESTINATION' | 'DETECTING_OBJECT' | 'GRASPING'
  | 'TRANSPORTING' | 'DEPOSITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED'

export type MissionType = 'TRANSPORT' | 'PICK_AND_PLACE'

export interface Mission {
  id: number
  type: MissionType
  status: MissionStatus
  userId: number
  robotId: number | null
  fromPointId: number
  toPointId: number
  objectId: number | null
  failureReason: string | null
  graspAttempts: number
  createdAt: string
  updatedAt: string
  fromPoint?: { id: number; name: string; slug: string }
  toPoint?: { id: number; name: string; slug: string }
  robot?: { id: number; name: string; status: string } | null
  user?: { id: number; name: string; email: string }
}

interface MissionFilters {
  status?: MissionStatus
  type?: MissionType
  page: number
  limit: number
}

interface MissionStore {
  missions: Mission[]
  currentMission: Mission | null
  loading: boolean
  error: string | null
  total: number
  filters: MissionFilters
  setFilters: (filters: Partial<MissionFilters>) => void
  fetchMissions: () => Promise<void>
  createMission: (data: { type: MissionType; fromPointId: number; toPointId: number; robotId?: number }) => Promise<Mission>
  cancelMission: (id: number) => Promise<void>
  setCurrentMission: (mission: Mission | null) => void
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  missions: [],
  currentMission: null,
  loading: false,
  error: null,
  total: 0,
  filters: { page: 1, limit: 20 },

  setFilters: (filters) =>
    set((s) => ({ filters: { ...s.filters, ...filters } })),

  fetchMissions: async () => {
    set({ loading: true, error: null })
    try {
      const { filters } = get()
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.type) params.set('type', filters.type)
      params.set('page', String(filters.page))
      params.set('limit', String(filters.limit))
      const res = await apiFetch(`/missions?${params}`)
      if (!res.ok) throw new Error('Erreur chargement missions')
      const json = await res.json() as { data: Mission[]; total: number }
      set({ missions: json.data, total: json.total })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Erreur inconnue' })
    } finally {
      set({ loading: false })
    }
  },

  createMission: async (data) => {
    const res = await apiFetch(`/missions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json() as { error: string }
      throw new Error(err.error)
    }
    const json = await res.json() as { data: Mission }
    set((s) => ({ missions: [json.data, ...s.missions] }))
    return json.data
  },

  cancelMission: async (id) => {
    const res = await apiFetch(`/missions/${id}/cancel`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json() as { error: string }
      throw new Error(err.error)
    }
    const json = await res.json() as { data: Mission }
    set((s) => ({
      missions: s.missions.map((m) => (m.id === id ? json.data : m)),
      currentMission: s.currentMission?.id === id ? json.data : s.currentMission,
    }))
  },

  setCurrentMission: (mission) => set({ currentMission: mission }),
}))
