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

export interface ScanData {
  ranges: number[]
  angleMin: number
  angleIncrement: number
}

export interface Pose {
  x: number
  y: number
  theta: number
}

export interface Frontier {
  x: number
  y: number
  size: number
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
  // overlays (T3.5.9)
  scan: ScanData | null
  plan: Pose[] | null
  frontiers: Frontier[] | null
  trail: { x: number; y: number }[]
  robotPose: Pose | null
  // tf/topics (T3.5.11)
  tfFrames: { id: string; parent: string }[] | null
  topics: { name: string; msgType: string }[] | null

  setState: (state: MappingState) => void
  setSession: (sessionId: number | null) => void
  setMapping: (s: MappingState, sessionId: number | null) => void
  setMapPng: (url: string | null) => void
  setMapMeta: (meta: MapMeta) => void
  setCoverage: (percent: number | null) => void
  setFailure: (reason: string | null) => void
  setWsConnected: (b: boolean) => void
  setLastTelemetry: (ts: number) => void
  setScan: (s: ScanData | null) => void
  setPlan: (poses: Pose[] | null) => void
  setFrontiers: (cells: Frontier[] | null) => void
  pushTrail: (point: { x: number; y: number }) => void
  setRobotPose: (p: Pose | null) => void
  setTfFrames: (f: { id: string; parent: string }[] | null) => void
  setTopics: (t: { name: string; msgType: string }[] | null) => void
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
  scan: null,
  plan: null,
  frontiers: null,
  trail: [],
  robotPose: null,
  tfFrames: null,
  topics: null,

  setState: (state) => set({ state }),
  setSession: (sessionId) => set({ sessionId }),
  setMapping: (state, sessionId) => set({ state, sessionId }),

  setMapPng: (url) => {
    const prev = get().mapPngUrl
    if (prev) URL.revokeObjectURL(prev)
    set({ mapPngUrl: url })
  },
  setMapMeta: (meta) => set({ mapMeta: meta }),
  setCoverage: (percent) => set({ coveragePercent: percent }),
  setFailure: (reason) => set({ failureReason: reason }),
  setWsConnected: (b) => set({ wsConnected: b }),
  setLastTelemetry: (ts) => set({ lastTelemetryAt: ts }),
  setScan: (s) => set({ scan: s }),
  setPlan: (poses) => set({ plan: poses }),
  setFrontiers: (cells) => set({ frontiers: cells }),
  pushTrail: (point) =>
    set((s) => {
      // garde max 500 points pour eviter memory creep en demo longue
      const next = [...s.trail, point]
      if (next.length > 500) next.shift()
      return { trail: next }
    }),
  setRobotPose: (p) => set({ robotPose: p }),
  setTfFrames: (f) => set({ tfFrames: f }),
  setTopics: (t) => set({ topics: t }),

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
      scan: null,
      plan: null,
      frontiers: null,
      trail: [],
      robotPose: null,
    })
  },
}))
