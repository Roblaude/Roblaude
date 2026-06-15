import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMissionStore, type Mission } from '../stores/missionStore'
import { StatusBadge } from '../components/StatusBadge'
import { MissionProgress } from '../components/MissionProgress'
import { apiFetch } from '@/lib/api'

// Une mission ne peut plus etre annulee une fois terminee.
const FINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED']

const TYPE_LABELS: Record<string, string> = {
  TRANSPORT: 'Transport de document',
  PICK_AND_PLACE: "Recuperation d'objet",
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { cancelMission } = useMissionStore()

  const [mission, setMission] = useState<Mission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch(`/missions/${id}`)
        if (!res.ok) throw new Error('Mission introuvable')
        const json = (await res.json()) as { data: Mission }
        if (!cancelled) setMission(json.data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleCancel() {
    if (!mission) return
    setCancelling(true)
    setError(null)
    try {
      await cancelMission(mission.id)
      setMission({ ...mission, status: 'CANCELLED' })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Echec de l'annulation")
    } finally {
      setCancelling(false)
    }
  }

  const canCancel = mission && !FINAL_STATUSES.includes(mission.status)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        to="/missions"
        className="inline-block text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4"
      >
        ← Retour aux missions
      </Link>
      <h1 className="text-2xl font-semibold text-white mb-6">Mission #{id}</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
        >
          {error}
        </div>
      )}

      {mission && (
        <div className="mb-5 overflow-x-auto">
          <MissionProgress status={mission.status} type={mission.type} />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : mission ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
          <DetailRow label="Statut">
            <StatusBadge status={mission.status} />
          </DetailRow>
          <DetailRow label="Type">{TYPE_LABELS[mission.type] ?? mission.type}</DetailRow>
          <DetailRow label="Depart">
            {mission.fromPoint?.name ?? `Point #${mission.fromPointId}`}
          </DetailRow>
          <DetailRow label="Arrivee">
            {mission.toPoint?.name ?? `Point #${mission.toPointId}`}
          </DetailRow>
          <DetailRow label="Robot">
            {mission.robot ? `${mission.robot.name} (${mission.robot.status})` : 'Non assigne'}
          </DetailRow>
          {mission.failureReason && (
            <DetailRow label="Cause d'echec">
              <span className="text-red-400">{mission.failureReason}</span>
            </DetailRow>
          )}
          <DetailRow label="Creee le">{fmtDate(mission.createdAt)}</DetailRow>
          <DetailRow label="Mise a jour">{fmtDate(mission.updatedAt)}</DetailRow>
        </div>
      ) : (
        !error && <p className="text-gray-500">Mission introuvable.</p>
      )}

      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="mt-5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm
                     font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {cancelling ? 'Annulation…' : 'Annuler la mission'}
        </button>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-gray-200">{children}</span>
    </div>
  )
}
