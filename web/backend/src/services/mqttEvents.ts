import { EventEmitter } from 'node:events'
import type { MissionStatus, RobotStatus } from '@prisma/client'

// Catalogue de tous les events emis par mqtt.ts.
// Chaque WS relay (wsRelay, et plus tard wsTelemetry/wsTf/...) s'abonne aux events qui le concernent.
// Decouple mqtt <-> relays — resout la dette tech mentionnee dans le journal #218.

export type MqttEvents = {
  battery_update: { robotId: number; percent: number }
  status_change:  { robotId: number; status: RobotStatus }
  robot_online:   { robotId: number }
  robot_offline:  { robotId: number }
  position_update: { robotId: number; x: number; y: number; theta?: number }
  mission_update: { missionId: number; status: MissionStatus; progress?: number }
  mission_completed: { missionId: number; result: 'completed'|'failed'|'cancelled'; reason?: string }
  // === mapping (T3.5.5) ===
  map_update: {
    robotId: number
    png: Buffer
    meta: { width: number; height: number; resolution: number; originX: number; originY: number; stamp: number }
  }
  scan_update: { robotId: number; ranges: number[]; angleMin: number; angleIncrement: number; frameId: string }
  plan_update: { robotId: number; poses: { x: number; y: number; theta: number }[] }
  frontiers_update: { robotId: number; cells: { x: number; y: number; size: number }[] }
  tf_update: {
    robotId: number
    frames: { id: string; parent: string; x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }[]
  }
  mapping_state: {
    robotId: number
    state: 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED'
    sessionId: number | null
    startedAt?: number
    coverageM2?: number
    coveragePercent?: number
    failureReason?: string
  }
  mapping_save_result: {
    robotId: number
    messageId?: string
    ok: boolean
    sessionId?: number
    name?: string
    pgm_base64?: string
    yaml?: string
    reason?: string
  }
  annotation_change: { robotId: number; action: 'created' | 'updated' | 'deleted'; annotation?: unknown; id?: number }
  // === peripheriques (camera + bras) ===
  camera_frame: { robotId: number; jpeg: Buffer }
  joint_states: { robotId: number; positions: number[]; names?: string[] }
}

class TypedMqttEvents extends EventEmitter {
  emit<K extends keyof MqttEvents>(event: K, payload: MqttEvents[K]): boolean {
    return super.emit(event, payload)
  }
  on<K extends keyof MqttEvents>(event: K, listener: (payload: MqttEvents[K]) => void): this {
    return super.on(event, listener)
  }
}

export const mqttEvents = new TypedMqttEvents()
