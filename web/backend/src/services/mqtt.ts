import mqtt, { type MqttClient } from 'mqtt'
import { randomUUID } from 'node:crypto'
import { MissionStatus, RobotStatus } from '@prisma/client'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { wsRelay } from './websocket'

// Adaptateur MQTT du backend — singleton.
// Topics et formats : voir docs/mqtt-spec.md

const SCHEMA_VERSION = 1

// Payloads attendus depuis le robot (spec §4 + §5.4)
// timestamp ISO-8601 obligatoire sur tous les messages.
// reason obligatoire si rejected/failed (spec §5.4 — Copilot review #218).

const missionAckSchema = z.object({
  messageId: z.string().min(1),
  timestamp: z.string().datetime(),
  missionId: z.number().int().positive(),
  result: z.enum(['accepted', 'rejected']),
  reason: z.string().optional(),
}).refine(
  (d) => d.result !== 'rejected' || (d.reason !== undefined && d.reason.length > 0),
  { message: 'reason est obligatoire si result === "rejected"', path: ['reason'] },
)

const missionStatusSchema = z.object({
  timestamp: z.string().datetime(),
  missionId: z.number().int().positive(),
  state: z.nativeEnum(MissionStatus),
  progress: z.number().min(0).max(1).optional(),
})

const missionResultSchema = z.object({
  messageId: z.string().min(1),
  timestamp: z.string().datetime(),
  missionId: z.number().int().positive(),
  result: z.enum(['completed', 'failed', 'cancelled']),
  reason: z.string().optional(),
}).refine(
  (d) => d.result !== 'failed' || (d.reason !== undefined && d.reason.length > 0),
  { message: 'reason est obligatoire si result === "failed"', path: ['reason'] },
)

// Mapping result -> MissionStatus Prisma
const RESULT_TO_STATUS = {
  completed: MissionStatus.COMPLETED,
  failed: MissionStatus.FAILED,
  cancelled: MissionStatus.CANCELLED,
} as const

// telemetry/battery (spec §5.2) — Robot.battery est un Int 0-100
const batterySchema = z.object({
  timestamp: z.string().datetime(),
  voltage: z.number().optional(),
  percent: z.number().int().min(0).max(100),
  charging: z.boolean().optional(),
})

// telemetry/position (spec §5.1) — pose 2D du robot (frame map ou odom)
const positionSchema = z.object({
  timestamp: z.string().datetime(),
  x: z.number(),
  y: z.number(),
  theta: z.number().optional(),
  frame: z.string().optional(),
})

// status — le robot publie son etat applicatif (spec §5.3).
// OFFLINE n'est pas publie par le robot lui-meme : c'est deduit du Last Will
// sur le topic connection (cf. handleConnection).
const statusSchema = z.object({
  timestamp: z.string().datetime(),
  state: z.enum(['AVAILABLE', 'BUSY', 'ERROR']),
})

// connection (spec §5.5) — Last Will retained, online:false a la coupure
const connectionSchema = z.object({
  timestamp: z.string().datetime(),
  online: z.boolean(),
})

/** Actions publiables sur roblaude/{robotId}/cmd/{action}. */
export type CmdAction =
  | 'mission'
  | 'cancel'
  | 'resume'
  | 'loading-confirmed'
  | 'emergency-stop'

// Duree de vie d'un messageId dans le cache d'idempotence. Au-dela, le retry
// du robot est traite comme un nouveau message. Le robot ne doit pas retry
// au-dela de cette fenetre (sinon double traitement) — la spec MQTT QoS 2
// garantit que le broker ne livre pas deux fois en moins de quelques minutes.
const SEEN_MESSAGE_TTL_MS = 60 * 60 * 1000 // 1 heure

class RobotMqttAdapter {
  private client: MqttClient | null = null
  // messageIds deja traites pour les evenements (cf. spec §4 — idempotence).
  // Map<messageId, expireAt>. TTL pour eviter fuite memoire sur long uptime
  // (bug Copilot #218 — la demo soutenance tournera 8h).
  private seenMessageIds = new Map<string, number>()

  /** Purge les messageIds expires. Appele a chaque add. */
  private purgeExpiredMessageIds(now: number = Date.now()): void {
    for (const [id, expireAt] of this.seenMessageIds) {
      if (expireAt <= now) this.seenMessageIds.delete(id)
    }
  }

  /**
   * Execute fn() une seule fois par messageId.
   * - Marque immediatement (synchrone) pour que deux deliveries concurrentes
   *   du meme messageId ne lancent pas deux fn() en parallele.
   * - Si fn() throw, on retire le messageId du cache : un retry du robot pourra
   *   retenter (sinon un hoquet DB bloquait definitivement — bug Copilot #218).
   * - Expire apres SEEN_MESSAGE_TTL_MS.
   */
  private async withIdempotence(
    messageId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const now = Date.now()
    this.purgeExpiredMessageIds(now)
    if (this.seenMessageIds.has(messageId)) return
    this.seenMessageIds.set(messageId, now + SEEN_MESSAGE_TTL_MS)
    try {
      await fn()
    } catch (err) {
      this.seenMessageIds.delete(messageId)
      throw err
    }
  }

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
        if (sub === 'battery') void this.handleBattery(robotId, data)
        else if (sub === 'position') void this.handlePosition(robotId, data)
        break
      case 'status':
        void this.handleStatus(robotId, data)
        break
      case 'mission':
        if (sub === 'ack') void this.handleMissionAck(robotId, data)
        else if (sub === 'status') void this.handleMissionStatus(data)
        else if (sub === 'result') void this.handleMissionResult(robotId, data)
        break
      case 'connection':
        void this.handleConnection(robotId, data)
        break
      default:
        console.warn(`[mqtt] famille de topic inconnue : ${family}`)
    }
  }

  // telemetry/battery — met a jour Robot.battery (percent 0-100).
  // Le robot publie a ~1 Hz, on update systematiquement (negligeable en DB).
  private async handleBattery(robotId: number, data: Record<string, unknown>) {
    const parsed = batterySchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] telemetry/battery rejete :', parsed.error.issues)
      return
    }
    try {
      await prisma.robot.update({
        where: { id: robotId },
        data: { battery: parsed.data.percent },
      })
      wsRelay.broadcast({
        type: 'battery_update',
        robotId,
        percent: parsed.data.percent,
      })
    } catch (err) {
      console.error('[mqtt] update battery :',
        err instanceof Error ? err.message : err)
    }
  }

  // telemetry/position — pose 2D du robot. Le bridge throttle deja a 1Hz
  // cote robot (#71), pas de throttle additionnel cote backend.
  private async handlePosition(robotId: number, data: Record<string, unknown>) {
    const parsed = positionSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] telemetry/position rejete :', parsed.error.issues)
      return
    }
    try {
      await prisma.robot.update({
        where: { id: robotId },
        data: {
          positionX: parsed.data.x,
          positionY: parsed.data.y,
          heading: parsed.data.theta ?? null,
        },
      })
    } catch (err) {
      console.error('[mqtt] update position :',
        err instanceof Error ? err.message : err)
    }
    // TODO websocket : relay position_update aux clients
  }

  // status — etat applicatif (AVAILABLE / BUSY / ERROR).
  // Ne touche pas a OFFLINE (gere par handleConnection via le Last Will).
  private async handleStatus(robotId: number, data: Record<string, unknown>) {
    const parsed = statusSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] status rejete :', parsed.error.issues)
      return
    }
    try {
      await prisma.robot.update({
        where: { id: robotId },
        data: { status: parsed.data.state as RobotStatus },
      })
      wsRelay.broadcast({
        type: 'status_change',
        robotId,
        status: parsed.data.state,
      })
    } catch (err) {
      console.error('[mqtt] update status :',
        err instanceof Error ? err.message : err)
    }
  }

  // connection — presence du robot via le Last Will MQTT.
  // online:false (LWT) -> Robot.status = OFFLINE
  // online:true        -> si etait OFFLINE, on restaure a AVAILABLE.
  //   (le robot republiera son status precis juste apres, qui ecrasera)
  private async handleConnection(robotId: number, data: Record<string, unknown>) {
    const parsed = connectionSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] connection rejete :', parsed.error.issues)
      return
    }
    try {
      if (!parsed.data.online) {
        await prisma.robot.update({
          where: { id: robotId },
          data: { status: RobotStatus.OFFLINE },
        })
        wsRelay.broadcast({ type: 'robot_offline', robotId })
      } else {
        await prisma.robot.updateMany({
          where: { id: robotId, status: RobotStatus.OFFLINE },
          data: { status: RobotStatus.AVAILABLE },
        })
        wsRelay.broadcast({ type: 'robot_online', robotId })
      }
    } catch (err) {
      console.error('[mqtt] update connection :',
        err instanceof Error ? err.message : err)
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
    await this.withIdempotence(messageId, async () => {
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
    }).catch((err) => {
      // L'echec NE marque PAS le messageId comme vu (cf. withIdempotence)
      console.error('[mqtt] update mission/ack :',
        err instanceof Error ? err.message : err)
    })
  }

  // mission/status — propage le sous-etat courant. Pas de messageId
  // (etat retained, on ecrase, pas besoin de dedoublonner).
  private async handleMissionStatus(data: Record<string, unknown>) {
    const parsed = missionStatusSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] mission/status rejete :', parsed.error.issues)
      return
    }
    const { missionId, state, progress } = parsed.data
    try {
      await prisma.mission.update({
        where: { id: missionId },
        data: { status: state },
      })
      wsRelay.broadcast({
        type: 'mission_update',
        missionId,
        status: state,
        progress,
      })
    } catch (err) {
      console.error('[mqtt] update mission/status :',
        err instanceof Error ? err.message : err)
    }
  }

  // mission/result — fin de mission. On met a jour la mission ET on libere
  // le robot (Robot.status = AVAILABLE) en une seule transaction.
  private async handleMissionResult(robotId: number, data: Record<string, unknown>) {
    const parsed = missionResultSchema.safeParse(data)
    if (!parsed.success) {
      console.warn('[mqtt] mission/result rejete :', parsed.error.issues)
      return
    }
    const { messageId, missionId, result, reason } = parsed.data
    const status = RESULT_TO_STATUS[result]
    const missionData: { status: MissionStatus; failureReason?: string } = { status }
    if (result === 'failed') missionData.failureReason = reason ?? 'failed'

    await this.withIdempotence(messageId, async () => {
      await prisma.$transaction([
        prisma.mission.update({ where: { id: missionId }, data: missionData }),
        prisma.robot.update({
          where: { id: robotId },
          data: { status: RobotStatus.AVAILABLE },
        }),
      ])
      wsRelay.broadcast({
        type: 'mission_completed',
        missionId,
        result,
        reason,
      })
      wsRelay.broadcast({
        type: 'status_change',
        robotId,
        status: RobotStatus.AVAILABLE,
      })
    }).catch((err) => {
      // L'echec NE marque PAS le messageId comme vu (cf. withIdempotence)
      console.error('[mqtt] update mission/result :',
        err instanceof Error ? err.message : err)
    })
  }

  /** Fermeture propre — a appeler a l'arret du serveur. */
  disconnect(): void {
    this.client?.end()
    this.client = null
  }
}

/** Singleton — pas de nouvelle instance a chaque import (cf. lib/prisma.ts). */
export const robotMqtt = new RobotMqttAdapter()
