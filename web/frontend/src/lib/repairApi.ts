import { apiFetch } from './api'

// API page Reparation (admin). Cote back : /api/admin/robots/:id/{health,repair}.
// On envoie un NOM d'action, jamais une commande shell.

export type RepairAction =
  | 'reconnect_stm32'
  | 'restart_ros'
  | 'resync_clock'
  | 'start_perception'
  | 'reboot'
  | 'shutdown'
export type HealthState = 'ok' | 'down' | 'active' | 'dead' | 'up' | 'unknown'

export interface RobotHealth {
  reachable: boolean
  stm32: HealthState
  ybNode: HealthState
  agent: HealthState
  m3pro: HealthState
  battery: number | null
  ts: string
}

export interface RepairResult {
  ok: boolean
  action: RepairAction
  command?: string
  stdout?: string
  stderr?: string
  code?: number
  note?: string
}

export const REPAIR_LABELS: Record<RepairAction, string> = {
  reconnect_stm32: 'Reconnecter le STM32',
  restart_ros: 'Redémarrer la stack ROS',
  resync_clock: 'Resync horloge',
  start_perception: 'Démarrer caméra + détecteur',
  reboot: 'Redémarrer le Jetson',
  shutdown: 'Éteindre le robot',
}

export async function getRobotHealth(robotId: number): Promise<RobotHealth> {
  const res = await apiFetch(`/admin/robots/${robotId}/health`)
  if (!res.ok) throw new Error(`getRobotHealth ${res.status}`)
  return res.json()
}

export async function runRepair(
  robotId: number,
  action: RepairAction,
  confirm = false,
): Promise<RepairResult> {
  const res = await apiFetch(`/admin/robots/${robotId}/repair`, {
    method: 'POST',
    body: JSON.stringify({ action, confirm }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `runRepair ${res.status}`)
  }
  return res.json()
}
