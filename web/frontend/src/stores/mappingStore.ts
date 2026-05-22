import { create } from 'zustand'

export type MappingState = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED'

export interface MapMeta {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  stamp: number
}

interface MappingStore {
  state: MappingState
  sessionId: number | null
  mapPngUrl: string | null
  mapMeta: MapMeta | null
  coveragePercent: number | null
  failureReason: string | null
  wsConnected: boolean
  lastTelemetryAt: number | null

  setState: (state: MappingState) => void
  setSession: (sessionId: number | null) => void
  setMapping: (s: MappingState, sessionId: number | null) => void
  setMapPng: (url: string | null) => void
  setMapMeta: (meta: MapMeta) => void
  setCoverage: (percent: number | null) => void
  setFailure: (reason: string | null) => void
  setWsConnected: (b: boolean) => void
  setLastTelemetry: (ts: number) => void
  reset: () => void
}

export const useMappingStore = create<MappingStore>((set, get) => ({
  state: 'IDLE',
  sessionId: null,
  mapPngUrl: null,
  mapMeta: null,
  coveragePercent: null,
  failureReason: null,
  wsConnected: false,
  lastTelemetryAt: null,

  setState: (state) => set({ state }),
  setSession: (sessionId) => set({ sessionId }),
  setMapping: (state, sessionId) => set({ state, sessionId }),

  setMapPng: (url) => {
    // revoke l'ancien blob URL pour eviter la fuite memoire
    const prev = get().mapPngUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ mapPngUrl: url })
  },
  setMapMeta: (meta) => set({ mapMeta: meta }),
  setCoverage: (percent) => set({ coveragePercent: percent }),
  setFailure: (reason) => set({ failureReason: reason }),
  setWsConnected: (b) => set({ wsConnected: b }),
  setLastTelemetry: (ts) => set({ lastTelemetryAt: ts }),

  reset: () => {
    const prev = get().mapPngUrl
    if (prev) URL.revokeObjectURL(prev)
    set({
      state: 'IDLE',
      sessionId: null,
      mapPngUrl: null,
      mapMeta: null,
      coveragePercent: null,
      failureReason: null,
    })
  },
}))
