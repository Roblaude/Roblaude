import { Check, X } from 'lucide-react'
import type { MissionStatus, MissionType } from '../stores/missionStore'

interface Step {
  status: MissionStatus
  label: string
}

// Pipeline ordonné par type de mission (les sous-états du robot).
const TRANSPORT_STEPS: Step[] = [
  { status: 'NAVIGATING_TO_PICKUP', label: 'Vers la collecte' },
  { status: 'WAITING_FOR_LOAD', label: 'Chargement' },
  { status: 'NAVIGATING_TO_DESTINATION', label: 'Transport' },
  { status: 'COMPLETED', label: 'Livré' },
]

const PICK_AND_PLACE_STEPS: Step[] = [
  { status: 'NAVIGATING_TO_PICKUP', label: "Vers l'objet" },
  { status: 'DETECTING_OBJECT', label: 'Détection' },
  { status: 'GRASPING', label: 'Saisie' },
  { status: 'TRANSPORTING', label: 'Transport' },
  { status: 'DEPOSITING', label: 'Dépôt' },
  { status: 'COMPLETED', label: 'Terminé' },
]

export function MissionProgress({ status, type }: { status: MissionStatus; type: MissionType }) {
  const steps = type === 'PICK_AND_PLACE' ? PICK_AND_PLACE_STEPS : TRANSPORT_STEPS
  const failed = status === 'FAILED' || status === 'CANCELLED'
  const completed = status === 'COMPLETED'
  const currentIndex = steps.findIndex((s) => s.status === status)

  return (
    <ol className="flex items-center" aria-label="Progression de la mission">
      {steps.map((step, i) => {
        const done = completed || (currentIndex > -1 && i < currentIndex)
        const current = !completed && !failed && i === currentIndex
        const isLast = i === steps.length - 1

        const dotClass = done
          ? 'bg-emerald-500 text-white border-emerald-500'
          : current
            ? 'bg-primary text-primary-foreground border-primary status-pulse'
            : 'bg-card text-muted-foreground border-border'

        return (
          <li key={step.status} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex size-6 items-center justify-center rounded-full border text-[10px] font-mono ${dotClass}`}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`text-[10px] whitespace-nowrap ${current ? 'text-primary' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span className={`h-px flex-1 mx-1 ${done ? 'bg-emerald-500/50' : 'bg-border'}`} aria-hidden />
            )}
          </li>
        )
      })}
      {failed && (
        <li className="ml-3 flex items-center gap-1 text-destructive text-[11px]" role="status">
          <X className="size-3.5" />
          {status === 'CANCELLED' ? 'Annulée' : 'Échec'}
        </li>
      )}
    </ol>
  )
}
