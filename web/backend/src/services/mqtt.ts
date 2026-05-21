import mqtt, { type MqttClient } from 'mqtt'
import { randomUUID } from 'node:crypto'
import { MissionStatus } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'

// Adaptateur MQTT du backend — singleton.
// Topics et formats : voir docs/mqtt-spec.md

const SCHEMA_VERSION = 1

// Payloads attendus depuis le robot (spec §5.4)
const missionAckSchema = z.object({
  messageId: z.string().min(1),
  missionId: z.number().int().positive(),
  result: z.enum(['accepted', 'rejected']),
  reason: z.string().optional(),
})

const missionStatusSchema = z.object({
  missionId: z.number().int().positive(),
  state: z.nativeEnum(MissionStatus),
  progress: z.number().min(0).max(1).optional(),
})

/** Actions publiables sur roblaude/{robotId}/cmd/{action}. */
export type CmdAction =
  | 'mission'
  | 'cancel'
  | 'resume'
  | 'loading-confirmed'
  | 'emergency-stop'

class RobotMqttAdapter {
  private client: MqttClient | null = null
  // messageIds deja traites pour les evenements (cf. spec §4 — idempotence).
  // In-memory : on perd le set au restart, le robot peut rejouer un ack ; en
  // pratique l'update Prisma reste idempotent (meme statut ecrit deux fois).
  private seenMessageIds = new Set<string>()

  /** Connexion au broker + abonnement aux topics robot (wildcard multi-robot). */
  connect(): void {
    if (this.client) return // deja connecte — singleton

    const url = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883'
    this.client = mqtt.connect(url, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 2000, // reconnexion auto toutes les 2 s
    })

    this.client.on('connect', () => {
      // Le `+` couvre tous les robots sans changer le code.
      this.client!.subscribe(
        [
          'roblaude/+/telemetry/#',
          'roblaude/+/status',
          'roblaude/+/mission/#',
          'roblaude/+/connection',
        ],
        { qos: 1 },
      )
      console.log('[mqtt] connecte au broker')
    })

    this.client.on('message', (topic, payload) => this.onMessage(topic, payload))
    this.client.on('error', (err) => console.error('[mqtt]', err.message))
    this.client.on('reconnect', () => console.log('[mqtt] reconnexion…'))
  }

  /**
   * Backend -> Robot. Publie sur roblaude/{robotId}/cmd/{action} en QoS 2.
   * L'enveloppe (schemaVersion, messageId, timestamp) est ajoutee ici.
   */
  publishCommand(robotId: number, action: CmdAction, body: object): void {
    if (!this.client) throw new Error('[mqtt] adaptateur non connecte')

    const message = {
      schemaVersion: SCHEMA_VERSION,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...body,
    }
    this.client.publish(
      `roblaude/${robotId}/cmd/${action}`,
      JSON.stringify(message),
      { qos: 2, retain: false },
    )
  }

  /** Robot -> Backend. Parse l'enveloppe puis route vers le bon traitement. */
  private onMessage(topic: string, payload: Buffer): void {
    // topic = roblaude/{robotId}/{family}/{sub?}
    const [, robotIdRaw, family, sub] = topic.split('/')
    const robotId = Number(robotIdRaw)

    let data: Record<string, unknown>
    try {
      data = JSON.parse(payload.toString())
      if (data.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`schemaVersion inconnue (${String(data.schemaVersion)})`)
      }
    } catch (err) {
      console.warn(`[mqtt] message rejete sur ${topic} :`,
        err instanceof Error ? err.message : err)
      return
    }

    switch (family) {
      case 'telemetry':
        // TODO #80 : sub === 'position' -> Robot.positionX/Y/heading (throttle)
        // TODO #202 : sub === 'battery' -> Robot.battery
        // puis relai WebSocket (position_update / battery_update)
        break
      case 'status':
        // TODO #202 : mettre a jour Robot.status + relai status_change
        break
      case 'mission':
        if (sub === 'ack') void this.handleMissionAck(robotId, data)
        else if (sub === 'status') void this.handleMissionStatus(data)
        // TODO #81 : sub === 'result' -> COMPLETED/FAILED/CANCELLED + failureReason
        break
      case 'connection':
        // TODO #202 : data.online === false (Last Will) -> Robot.status = OFFLINE
        break
      default:
        console.warn(`[mqtt] famille de topic inconnue : ${family}`)
    }
  }

  // mission/ack — accepted: on attache le robot a la mission.
  //               rejected: status = FAILED + failureReason.
  // L'idempotence repose sur messageId (cf. spec §4).
  private async handleMissionAck(robotId: number, data: Record<string, unknown>) {
    const parsed = missionAckSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] mission/ack rejete :', parsed.error.issues)
      return
    }
    const { messageId, missionId, result, reason } = parsed.data
    if (this.seenMessageIds.has(messageId)) return
    this.seenMessageIds.add(messageId)

    try {
      if (result === 'accepted') {
        await prisma.mission.update({
          where: { id: missionId },
          data: { robotId },
        })
      } else {
        await prisma.mission.update({
          where: { id: missionId },
          data: { status: MissionStatus.FAILED, failureReason: reason ?? 'rejected' },
        })
      }
    } catch (err) {
      console.error('[mqtt] update mission/ack :',
        err instanceof Error ? err.message : err)
    }
  }

  // mission/status — propage le sous-etat courant. Pas de messageId
  // (etat retained, on ecrase, pas besoin de dedoublonner).
  private async handleMissionStatus(data: Record<string, unknown>) {
    const parsed = missionStatusSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] mission/status rejete :', parsed.error.issues)
      return
    }
    const { missionId, state } = parsed.data
    try {
      await prisma.mission.update({
        where: { id: missionId },
        data: { status: state },
      })
    } catch (err) {
      console.error('[mqtt] update mission/status :',
        err instanceof Error ? err.message : err)
    }
  }

  /** Fermeture propre — a appeler a l'arret du serveur. */
  disconnect(): void {
    this.client?.end()
    this.client = null
  }
}

/** Singleton — pas de nouvelle instance a chaque import (cf. lib/prisma.ts). */
export const robotMqtt = new RobotMqttAdapter()
