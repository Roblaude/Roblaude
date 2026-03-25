import type { MissionStatus } from '../stores/missionStore'

const CONFIG: Record<MissionStatus, { label: string; classes: string }> = {
  PENDING:                    { label: 'En attente',    classes: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  NAVIGATING_TO_PICKUP:       { label: 'En route →',   classes: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  WAITING_FOR_LOAD:           { label: 'Attente chargement', classes: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  NAVIGATING_TO_DESTINATION:  { label: 'Transport',    classes: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  DETECTING_OBJECT:           { label: 'Détection',    classes: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  GRASPING:                   { label: 'Saisie',       classes: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  TRANSPORTING:               { label: 'Transport',    classes: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  DEPOSITING:                 { label: 'Dépôt',        classes: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  COMPLETED:                  { label: 'Terminée',     classes: 'bg-green-500/20 text-green-300 border-green-500/30' },
  FAILED:                     { label: 'Échouée',      classes: 'bg-red-500/20 text-red-300 border-red-500/30' },
  CANCELLED:                  { label: 'Annulée',      classes: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  PAUSED:                     { label: 'En pause',     classes: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
}

interface Props {
  status: MissionStatus
}

export function StatusBadge({ status }: Props) {
  const { label, classes } = CONFIG[status] ?? CONFIG.PENDING
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${classes}`}>
      {label}
    </span>
  )
}
