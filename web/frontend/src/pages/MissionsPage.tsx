import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMissionStore, type MissionStatus, type MissionType } from '../stores/missionStore'
import { StatusBadge } from '../components/StatusBadge'

const STATUS_OPTIONS: { value: MissionStatus | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'NAVIGATING_TO_PICKUP', label: 'En route collecte' },
  { value: 'WAITING_FOR_LOAD', label: 'Attente chargement' },
  { value: 'NAVIGATING_TO_DESTINATION', label: 'Transport' },
  { value: 'COMPLETED', label: 'Terminée' },
  { value: 'FAILED', label: 'Échouée' },
  { value: 'CANCELLED', label: 'Annulée' },
  { value: 'PAUSED', label: 'En pause' },
]

const TYPE_OPTIONS: { value: MissionType | ''; label: string }[] = [
  { value: '', label: 'Tous les types' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'PICK_AND_PLACE', label: 'Pick & Place' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function MissionsPage() {
  const { missions, loading, error, total, filters, fetchMissions, setFilters } = useMissionStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchMissions()
  }, [filters, fetchMissions])

  const totalPages = Math.max(1, Math.ceil(total / filters.limit))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Missions</h1>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">{total} mission{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          to="/missions/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700
                     text-white text-sm font-medium rounded-lg transition-colors"
        >
          <span aria-hidden="true">＋</span>
          Nouvelle mission
        </Link>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters({ status: (e.target.value as MissionStatus) || undefined, page: 1 })}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2
                     focus:outline-none focus:border-violet-500 transition-colors"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select
          value={filters.type ?? ''}
          onChange={(e) => setFilters({ type: (e.target.value as MissionType) || undefined, page: 1 })}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2
                     focus:outline-none focus:border-violet-500 transition-colors"
        >
          {TYPE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {(filters.status || filters.type) && (
          <button
            onClick={() => setFilters({ status: undefined, type: undefined, page: 1 })}
            className="text-sm text-gray-400 hover:text-white transition-colors px-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">ID</th>
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">Départ</th>
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">Arrivée</th>
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">Statut</th>
                <th className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && missions.length === 0 ? (
                // Skeleton rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="bg-gray-950">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-800 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : missions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Aucune mission trouvée
                  </td>
                </tr>
              ) : (
                missions.map((mission) => (
                  <tr
                    key={mission.id}
                    onClick={() => navigate(`/missions/${mission.id}`)}
                    className="bg-gray-950 hover:bg-gray-900 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-gray-400">#{mission.id}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {mission.type === 'TRANSPORT' ? 'Transport' : 'Pick & Place'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {mission.fromPoint?.name ?? `Point ${mission.fromPointId}`}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {mission.toPoint?.name ?? `Point ${mission.toPointId}`}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={mission.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(mission.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {filters.page} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters({ page: filters.page - 1 })}
              disabled={filters.page <= 1}
              className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 text-gray-300
                         rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            >
              ← Précédent
            </button>
            <button
              onClick={() => setFilters({ page: filters.page + 1 })}
              disabled={filters.page >= totalPages}
              className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 text-gray-300
                         rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
