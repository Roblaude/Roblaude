import { useParams, Link } from 'react-router-dom'

export function MissionDetailPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/missions" className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-block">
        ← Retour aux missions
      </Link>
      <h1 className="text-2xl font-semibold text-white mb-6">Mission #{id}</h1>
      <p className="text-gray-500">Détail de la mission — ticket T2.2.5</p>
    </div>
  )
}
