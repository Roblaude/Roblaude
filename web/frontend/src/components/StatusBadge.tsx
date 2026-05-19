import type { MissionStatus } from '../stores/missionStore'

const CONFIG: Record<MissionStatus, { label: string; classes: string }> = {
  PENDING:                    { label: 'En attente',          classes: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20' },
  NAVIGATING_TO_PICKUP:       { label: 'Trajet collecte',     classes: 'bg-primary/10 text-primary border-primary/30' },
  WAITING_FOR_LOAD:           { label: 'Attente charge',      classes: 'bg-primary/10 text-primary border-primary/30' },
  NAVIGATING_TO_DESTINATION:  { label: 'Transport',           classes: 'bg-primary/10 text-primary border-primary/30' },
  DETECTING_OBJECT:           { label: 'Détection',           classes: 'bg-primary/10 text-primary border-primary/30' },
  GRASPING:                   { label: 'Saisie',              classes: 'bg-primary/10 text-primary border-primary/30' },
  TRANSPORTING:               { label: 'Transport',           classes: 'bg-primary/10 text-primary border-primary/30' },
  DEPOSITING:                 { label: 'Dépôt',               classes: 'bg-primary/10 text-primary border-primary/30' },
  COMPLETED:                  { label: 'Terminée',            classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  FAILED:                     { label: 'Échouée',             classes: 'bg-destructive/10 text-destructive border-destructive/30' },
  CANCELLED:                  { label: 'Annulée',             classes: 'bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20' },
  PAUSED:                     { label: 'En pause',            classes: 'bg-primary/10 text-primary border-primary/30' },
}

interface Props {
  status: MissionStatus
}

export function StatusBadge({ status }: Props) {
  const { label, classes } = CONFIG[status] ?? CONFIG.PENDING
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-widest ${classes}`}
    >
      <span className="size-1 rounded-full bg-current" />
      {label}
    </span>
  )
}
