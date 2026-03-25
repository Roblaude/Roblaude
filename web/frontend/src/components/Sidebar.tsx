import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { StopButton } from './StopButton'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⊞' },
  { to: '/missions', label: 'Missions', icon: '📋' },
  { to: '/missions/new', label: 'Nouvelle mission', icon: '＋' },
  { to: '/admin', label: 'Admin', icon: '⚙' },
  { to: '/profile', label: 'Profil', icon: '👤' },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()

  return (
    <aside
      aria-label="Navigation principale"
      className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60
                 bg-gray-900 text-gray-100 border-r border-gray-800 z-30"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
        <span className="text-2xl">🤖</span>
        <span className="text-lg font-semibold tracking-tight">RobLaude</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
               ${isActive
                 ? 'bg-violet-600 text-white'
                 : 'text-gray-400 hover:bg-gray-800 hover:text-white'
               }`
            }
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800 space-y-3">
        <StopButton />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Invité'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.role ?? '—'}</p>
          </div>
        </div>

        {user && (
          <button
            onClick={logout}
            className="w-full text-left text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Déconnexion
          </button>
        )}
      </div>
    </aside>
  )
}
