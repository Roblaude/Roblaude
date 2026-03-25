import { NavLink } from 'react-router-dom'
import { StopButton } from './StopButton'

const LEFT_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⊞' },
  { to: '/missions', label: 'Missions', icon: '📋' },
]

const RIGHT_ITEMS = [
  { to: '/admin', label: 'Admin', icon: '⚙' },
  { to: '/profile', label: 'Profil', icon: '👤' },
]

export function BottomNav() {
  return (
    <nav
      aria-label="Navigation mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-gray-900 border-t border-gray-800
                 flex items-center justify-around z-30"
    >
      {LEFT_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 flex-1 py-2 text-xs transition-colors
             ${isActive ? 'text-violet-400' : 'text-gray-500 hover:text-gray-200'}`
          }
        >
          <span className="text-xl" aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}

      {/* STOP — centre, toujours visible */}
      <div className="flex flex-col items-center flex-1">
        <StopButton compact />
      </div>

      {RIGHT_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 flex-1 py-2 text-xs transition-colors
             ${isActive ? 'text-violet-400' : 'text-gray-500 hover:text-gray-200'}`
          }
        >
          <span className="text-xl" aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
