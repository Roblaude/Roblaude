import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMissionStore, type MissionType } from '../stores/missionStore'
import { apiFetch } from '@/lib/api'

// Le backend expose ces champs sur /api/points et /api/robots.
interface Point {
  id: number
  name: string
  slug: string
}
interface RobotLite {
  id: number
  name: string
  status: string
}

export function NewMissionPage() {
  const navigate = useNavigate()
  const { createMission } = useMissionStore()

  const [points, setPoints] = useState<Point[]>([])
  const [robots, setRobots] = useState<RobotLite[]>([])
  const [type, setType] = useState<MissionType>('TRANSPORT')
  const [fromPointId, setFromPointId] = useState<number | ''>('')
  const [toPointId, setToPointId] = useState<number | ''>('')
  const [robotId, setRobotId] = useState<number | ''>('')

  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charge les points et robots disponibles pour les listes deroulantes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          apiFetch('/points'),
          apiFetch('/robots'),
        ])
        if (cancelled) return
        if (pRes.ok) {
          const j = (await pRes.json()) as { data: Point[] }
          setPoints(j.data)
        }
        if (rRes.ok) {
          const j = (await rRes.json()) as { data: RobotLite[] }
          setRobots(j.data)
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les points et robots')
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (fromPointId === '' || toPointId === '') {
      setError('Selectionne un point de depart et un point d arrivee')
      return
    }
    if (fromPointId === toPointId) {
      setError('Le depart et l arrivee doivent etre differents')
      return
    }

    setSubmitting(true)
    try {
      await createMission({
        type,
        fromPointId: Number(fromPointId),
        toPointId: Number(toPointId),
        ...(robotId !== '' ? { robotId: Number(robotId) } : {}),
      })
      navigate('/missions')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la creation')
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass =
    'w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg ' +
    'px-3 py-2.5 focus:outline-none focus:border-violet-500 disabled:opacity-50'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        to="/missions"
        className="inline-block text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4"
      >
        ← Retour aux missions
      </Link>
      <h1 className="text-2xl font-semibold text-white mb-6">Nouvelle mission</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Type de mission */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="text-sm font-medium text-gray-300">
            Type de mission
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as MissionType)}
            className={selectClass}
          >
            <option value="TRANSPORT">Transport de document</option>
            <option value="PICK_AND_PLACE">Recuperation d objet</option>
          </select>
        </div>

        {/* Point de depart */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fromPoint" className="text-sm font-medium text-gray-300">
            Point de depart
          </label>
          <select
            id="fromPoint"
            value={fromPointId}
            onChange={(e) => setFromPointId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingData}
            className={selectClass}
          >
            <option value="">— Choisir un point —</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Point d arrivee */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="toPoint" className="text-sm font-medium text-gray-300">
            Point d arrivee
          </label>
          <select
            id="toPoint"
            value={toPointId}
            onChange={(e) => setToPointId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingData}
            className={selectClass}
          >
            <option value="">— Choisir un point —</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Robot (optionnel) */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="robot" className="text-sm font-medium text-gray-300">
            Robot{' '}
            <span className="text-gray-500">(optionnel — assigne automatiquement sinon)</span>
          </label>
          <select
            id="robot"
            value={robotId}
            onChange={(e) => setRobotId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingData}
            className={selectClass}
          >
            <option value="">— Assignation automatique —</option>
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.status})
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2">
          <button
            type="submit"
            disabled={submitting || loadingData}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creation…' : 'Creer la mission'}
          </button>
          <Link
            to="/missions"
            className="px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm
                       rounded-lg hover:bg-gray-700 transition-colors"
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  )
}
