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
  // Les events mapping (map, scan, plan, ...) seront ajoutes en T3.5.5.
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
