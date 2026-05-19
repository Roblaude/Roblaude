import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export type RobotStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ERROR'

export interface RobotPosition {
  x: number
  y: number
  heading: number
}

interface RobotStore {
  id: number
  name: string
  status: RobotStatus
  position: RobotPosition
  batteryLevel: number
  connected: boolean
  lastSync: number | null
  error: string | null
  // alimentation WebSocket/MQTT — sprint 4
  setStatus: (status: RobotStatus) => void
  setPosition: (pos: Partial<RobotPosition>) => void
  setBatteryLevel: (level: number) => void
  setConnected: (connected: boolean) => void
  fetchStatus: () => Promise<void>
}

export const useRobotStore = create<RobotStore>((set) => ({
  id: 1,
  name: 'Transbot-01',
  status: 'OFFLINE',
  position: { x: 0, y: 0, heading: 0 },
  batteryLevel: 0,
  connected: false,
  lastSync: null,
  error: null,

  setStatus: (status) => set({ status }),
  setPosition: (pos) => set((s) => ({ position: { ...s.position, ...pos } })),
  setBatteryLevel: (batteryLevel) => set({ batteryLevel }),
  setConnected: (connected) => set({ connected }),

  fetchStatus: async () => {
    try {
      const res = await apiFetch('/robots/1/status')
      if (!res.ok) {
        set({ connected: false, error: `HTTP ${res.status}` })
        return
      }
      const json = (await res.json()) as {
        data: {
          id: number
          name: string
          status: RobotStatus
          battery: number
          positionX: number | null
          positionY: number | null
          heading: number | null
        }
      }
      set({
        id: json.data.id,
        name: json.data.name,
        status: json.data.status,
        batteryLevel: json.data.battery,
        position: {
          x: json.data.positionX ?? 0,
          y: json.data.positionY ?? 0,
          heading: json.data.heading ?? 0,
        },
        connected: true,
        lastSync: Date.now(),
        error: null,
      })
    } catch (e) {
      set({
        connected: false,
        error: e instanceof Error ? e.message : 'Réseau indisponible',
      })
    }
  },
}))
