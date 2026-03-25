import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

export function ProfilePage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-6">Profil</h1>

      {user ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-violet-600 flex items-center justify-center text-2xl font-bold text-white">
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-medium text-white">{user.name}</p>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Rôle</span>
              <span className="text-white font-medium">{user.role}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ID</span>
              <span className="text-gray-400 font-mono">#{user.id}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-2 py-2.5 rounded-lg border border-red-500/30 text-red-400
                       hover:bg-red-500/10 transition-colors text-sm font-medium"
          >
            Déconnexion
          </button>
        </div>
      ) : (
        <p className="text-gray-500">Non connecté</p>
      )}
    </div>
  )
}
