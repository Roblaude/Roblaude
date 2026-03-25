import { create } from 'zustand'

export type RobotStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'ERROR'

export interface RobotPosition {
  x: number
  y: number
  heading: number
}

interface RobotStore {
  status: RobotStatus
  position: RobotPosition
  batteryLevel: number
  connected: boolean
  // alimenté par WebSocket — ticket MQTT sprint 4
  setStatus: (status: RobotStatus) => void
  setPosition: (pos: Partial<RobotPosition>) => void
  setBatteryLevel: (level: number) => void
  setConnected: (connected: boolean) => void
}

export const useRobotStore = create<RobotStore>((set) => ({
  status: 'OFFLINE',
  position: { x: 0, y: 0, heading: 0 },
  batteryLevel: 100,
  connected: false,

  setStatus: (status) => set({ status }),
  setPosition: (pos) => set((s) => ({ position: { ...s.position, ...pos } })),
  setBatteryLevel: (batteryLevel) => set({ batteryLevel }),
  setConnected: (connected) => set({ connected }),
}))
