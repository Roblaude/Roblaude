import mqtt, { type MqttClient } from 'mqtt'
import { randomUUID } from 'node:crypto'

/**
 * Adaptateur MQTT du backend — singleton.
 *
 * Squelette du ticket T4.2.1. La connexion au broker, l'abonnement wildcard
 * et la publication des commandes sont fonctionnels. Le traitement des
 * messages entrants (mise a jour Prisma + relai WebSocket) reste a faire
 * dans les tickets T4.2.3, T4.2.4, T4.2.5 et T4.2.9.
 *
 * Topics et formats : voir docs/mqtt-spec.md
 */

const SCHEMA_VERSION = 1

/** Actions publiables sur roblaude/{robotId}/cmd/{action}. */
export type CmdAction =
  | 'mission'
  | 'cancel'
  | 'resume'
  | 'loading-confirmed'
  | 'emergency-stop'

class RobotMqttAdapter {
  private client: MqttClient | null = null

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
        // TODO #79 : sub === 'ack' | 'status' -> Mission.status
        // TODO #81 : sub === 'result' -> COMPLETED/FAILED/CANCELLED + failureReason
        break
      case 'connection':
        // TODO #202 : data.online === false (Last Will) -> Robot.status = OFFLINE
        break
      default:
        console.warn(`[mqtt] famille de topic inconnue : ${family}`)
    }

    // Reference robotId/sub en attendant les TODO ci-dessus (evite le bruit lint).
    void robotId
    void sub
  }

  /** Fermeture propre — a appeler a l'arret du serveur. */
  disconnect(): void {
    this.client?.end()
    this.client = null
  }
}

/** Singleton — pas de nouvelle instance a chaque import (cf. lib/prisma.ts). */
export const robotMqtt = new RobotMqttAdapter()
