import { NavLink } from 'react-router-dom'
import { StopButton } from './StopButton'
import { LayoutDashboard, ListChecks, Settings2, User } from 'lucide-react'

const LEFT_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/missions', label: 'Missions', Icon: ListChecks },
]

const RIGHT_ITEMS = [
  { to: '/admin', label: 'Admin', Icon: Settings2 },
  { to: '/profile', label: 'Profil', Icon: User },
]

export function BottomNav() {
  return (
    <nav
      aria-label="Navigation mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 h-18 bg-card/80 backdrop-blur-md
                 border-t border-border flex items-center justify-around z-30
                 pb-[env(safe-area-inset-bottom)]"
    >
      {LEFT_ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 flex-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors
             ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`size-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(245,165,36,0.6)]' : ''}`} aria-hidden />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}

      {/* STOP — centre, toujours visible */}
      <div className="flex flex-col items-center flex-1">
        <StopButton compact />
      </div>

      {RIGHT_ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 flex-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors
             ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`size-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(245,165,36,0.6)]' : ''}`} aria-hidden />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
