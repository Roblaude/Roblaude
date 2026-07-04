// Actions de reparation robot exposees au front. L'idee : le front envoie un
// NOM d'action (pas une commande shell), le backend mappe vers une commande SSH
// fixe. Surface fermee -> pas d'injection possible.

export type RepairAction =
  | 'reconnect_stm32'
  | 'restart_ros'
  | 'resync_clock'
  | 'start_perception'
  | 'reboot'
  | 'shutdown'

export const REPAIR_ACTIONS: readonly RepairAction[] = [
  'reconnect_stm32',
  'restart_ros',
  'resync_clock',
  'start_perception',
  'reboot',
  'shutdown',
]

export const REPAIR_LABELS: Record<RepairAction, string> = {
  reconnect_stm32: 'Reconnexion STM32',
  restart_ros: 'Redémarrage stack ROS',
  resync_clock: 'Resync horloge',
  start_perception: 'Démarrer caméra + détecteur',
  reboot: 'Redémarrage Jetson',
  shutdown: 'Extinction propre',
}

export function isRepairAction(x: unknown): x is RepairAction {
  return typeof x === 'string' && (REPAIR_ACTIONS as readonly string[]).includes(x)
}

// Commande SSH fixe pour une action. `nowUtc` (genere cote serveur, jamais le
// client) sert uniquement a resync_clock.
export function repairCommand(action: RepairAction, nowUtc?: string): string {
  switch (action) {
    case 'reconnect_stm32':
      // restart du service -> son ExecStartPre relie /dev/myserial au CP2104 tout seul
      return 'sudo systemctl restart micro-ros-agent.service'
    case 'restart_ros':
      return 'docker restart m3pro'
    case 'resync_clock':
      return `sudo date -u -s "${nowUtc ?? ''}"`
    case 'start_perception':
      // idempotent : le script skip ce qui tourne deja
      return '/home/jetson/roblaude_ws/scripts/start_perception.sh'
    case 'reboot':
      return 'sudo reboot'
    case 'shutdown':
      // docker stop -> le trap de container_autostart range le bras avant la coupure, puis extinction
      return 'docker stop -t 6 m3pro; sudo shutdown -h now'
  }
}
