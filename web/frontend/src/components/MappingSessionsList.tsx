import { useEffect, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { listSessions, type MappingSessionLite } from '@/lib/mappingApi'

interface Props {
  robotId: number
  // refreshKey change quand on veut force-refresh (apres start/stop/save)
  refreshKey?: number
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const sec = Math.floor((end - start) / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  return `${m}m${sec % 60 < 10 ? '0' : ''}${sec % 60}`
}

const STATE_COLOR: Record<string, string> = {
  STARTING: 'text-yellow-400',
  RUNNING: 'text-green-400',
  STOPPING: 'text-yellow-400',
  STOPPED: 'text-gray-400',
  FAILED: 'text-red-400',
}

export function MappingSessionsList({ robotId, refreshKey }: Props) {
  const [sessions, setSessions] = useState<MappingSessionLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSessions(robotId)
      setSessions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotId, refreshKey])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Historique sessions</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-gray-500 hover:text-white disabled:opacity-50"
          aria-label="Rafraichir"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      {sessions.length === 0 && !loading && (
        <div className="text-xs text-gray-500 py-4">Aucune session pour ce robot.</div>
      )}

      <ul className="space-y-2">
        {sessions.slice(0, 10).map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2 last:border-0">
            <div>
              <div className="text-gray-200">
                #{s.id} <span className={STATE_COLOR[s.state] ?? 'text-gray-400'}>{s.state}</span>
              </div>
              <div className="text-xs text-gray-500">
                {fmtDate(s.startedAt)} · {fmtDuration(s.startedAt, s.endedAt)}
                {s._count && ` · ${s._count.snapshots} carte${s._count.snapshots > 1 ? 's' : ''}`}
              </div>
              {s.failureReason && <div className="text-xs text-red-400 mt-0.5">{s.failureReason}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
