import { useRobotStore } from '../stores/robotStore'

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'bg-green-500/20 text-green-400 border-green-500/30',
  BUSY:       'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  OFFLINE:    'bg-gray-500/20 text-gray-400 border-gray-500/30',
  ERROR:      'bg-red-500/20 text-red-400 border-red-500/30',
}

export function DashboardPage() {
  const { status, batteryLevel, connected } = useRobotStore()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Statut robot</p>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${STATUS_COLOR[status] ?? STATUS_COLOR.OFFLINE}`}>
            {status}
          </span>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Batterie</p>
          <p className="text-2xl font-bold text-white">{batteryLevel}%</p>
          <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${batteryLevel}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Connexion</p>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-white font-medium">{connected ? 'Connecté' : 'Déconnecté'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
