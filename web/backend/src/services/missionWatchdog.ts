import { MissionStatus, RobotStatus } from '@prisma/client'
import prisma from '../lib/prisma'
import { mqttEvents } from './mqttEvents'

// Si une mission active ne progresse plus (aucun mission/status ni mission/result)
// pendant ce delai, on considere le robot bloque/injoignable : la mission passe
// FAILED et le robot est libere. Configurable via env pour la demo soutenance.
const DEFAULT_TIMEOUT_MS = Number(process.env.MISSION_TIMEOUT_MS) || 2 * 60 * 1000

// Statuts qui peuvent expirer. PAUSED exclu : une mise en pause volontaire
// ne doit pas declencher le timeout.
const ACTIVE_STATUSES: MissionStatus[] = [
  MissionStatus.PENDING,
  MissionStatus.NAVIGATING_TO_PICKUP,
  MissionStatus.WAITING_FOR_LOAD,
  MissionStatus.NAVIGATING_TO_DESTINATION,
  MissionStatus.DETECTING_OBJECT,
  MissionStatus.GRASPING,
  MissionStatus.TRANSPORTING,
  MissionStatus.DEPOSITING,
]

class MissionWatchdog {
  private timers = new Map<number, ReturnType<typeof setTimeout>>()

  constructor(private timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  /**
   * (Re)arme le timer d'une mission. Appele au demarrage (mission/ack accepted)
   * et a chaque progres (mission/status) : tant que le robot avance, on repousse.
   */
  arm(missionId: number, robotId: number): void {
    this.clear(missionId)
    const timer = setTimeout(() => { void this.fire(missionId, robotId) }, this.timeoutMs)
    // ne pas garder le process en vie juste pour ce timer
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(missionId, timer)
  }

  /** Annule le timer (mission terminee). */
  clear(missionId: number): void {
    const timer = this.timers.get(missionId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(missionId)
    }
  }

  private async fire(missionId: number, robotId: number): Promise<void> {
    this.timers.delete(missionId)
    try {
      // updateMany filtre sur les statuts actifs : si un mission/result tardif
      // a deja termine la mission, count = 0 et on ne touche a rien (course).
      const updated = await prisma.mission.updateMany({
        where: { id: missionId, status: { in: ACTIVE_STATUSES } },
        data: { status: MissionStatus.FAILED, failureReason: 'timeout' },
      })
      if (updated.count === 0) return

      await prisma.robot.update({
        where: { id: robotId },
        data: { status: RobotStatus.AVAILABLE },
      })
      mqttEvents.emit('mission_completed', { missionId, result: 'failed', reason: 'timeout' })
      mqttEvents.emit('status_change', { robotId, status: RobotStatus.AVAILABLE })
    } catch (err) {
      console.error('[watchdog] timeout mission', missionId, ':',
        err instanceof Error ? err.message : err)
    }
  }

  /** Tests : nombre de timers armes. */
  get pending(): number {
    return this.timers.size
  }

  /** Tests : annule tous les timers. */
  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}

export const missionWatchdog = new MissionWatchdog()
export { MissionWatchdog }
