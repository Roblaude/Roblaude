import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRobotStore } from '../stores/robotStore'
import { StopButton } from './StopButton'
import { useThemeStore } from '../stores/themeStore'
import {
  LayoutDashboard,
  ListChecks,
  Plus,
  Settings2,
  User,
  LogOut,
  Map,
  Terminal,
  Sparkles,
  Package,
  Wrench,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', code: '01', Icon: LayoutDashboard, adminOnly: false },
  { to: '/missions', label: 'Missions', code: '02', Icon: ListChecks, adminOnly: false },
  { to: '/missions/new', label: 'Nouvelle mission', code: '03', Icon: Plus, adminOnly: false },
  { to: '/mapping', label: 'Mode mapping', code: '04', Icon: Map, adminOnly: false },
  { to: '/admin', label: 'Admin', code: '05', Icon: Settings2, adminOnly: true },
  { to: '/admin/objects', label: 'Objets', code: '06', Icon: Package, adminOnly: true },
  { to: '/admin/ssh', label: 'SSH admin', code: '07', Icon: Terminal, adminOnly: true },
  { to: '/admin/repair', label: 'Réparation', code: '08', Icon: Wrench, adminOnly: true },
  { to: '/profile', label: 'Profil', code: '09', Icon: User, adminOnly: false },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { connected, status } = useRobotStore()
  const arcade = useThemeStore((s) => s.arcade)
  const toggleArcade = useThemeStore((s) => s.toggleArcade)

  return (
    <aside
      aria-label="Navigation principale"
      className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64
                 bg-card/40 backdrop-blur-sm border-r border-border z-30"
    >
      {/* Logo / Header */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="relative size-8 rounded-sm border border-primary/40 bg-primary/10 flex items-center justify-center">
          <span className="font-mono text-primary text-[15px] font-bold leading-none">R</span>
          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[14px] font-semibold tracking-tight text-foreground">
            ROBLAUDE
          </span>
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
            Control // Terminal
          </span>
        </div>
      </div>

      {/* Statut robot compact */}
      <div className="px-5 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            · Robot
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest
                        ${connected ? 'text-emerald-400' : 'text-destructive'}`}
          >
            <span
              className={`size-1.5 rounded-full ${
                connected ? 'bg-emerald-500 status-pulse' : 'bg-destructive'
              }`}
            />
            {connected ? status : 'Hors-ligne'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN').map(({ to, label, code, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors
               ${
                 isActive
                   ? 'bg-primary/10 text-primary'
                   : 'text-muted-foreground hover:bg-card hover:text-foreground'
               }`
            }
          >
            {({ isActive }) => (
              <>
                {/* barre active à gauche */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r
                              ${isActive ? 'bg-primary' : 'bg-transparent'}`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-[10px] ${
                    isActive ? 'text-primary/80' : 'text-muted-foreground/60'
                  }`}
                >
                  {code}
                </span>
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border space-y-3">
        <button
          onClick={toggleArcade}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
            arcade
              ? 'bg-primary/20 border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={arcade}
        >
          <Sparkles className="w-3 h-3" /> {arcade ? 'Arcade ON' : 'Mode arcade'}
        </button>

        <StopButton />

        <div className="flex items-center gap-2.5 pt-1">
          <div className="size-8 rounded-sm border border-primary/40 bg-primary/10 flex items-center justify-center">
            <span className="font-mono text-primary text-sm font-semibold">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name ?? 'Invité'}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
              {user?.role ?? '—'}
            </p>
          </div>
          {user && (
            <button
              onClick={logout}
              aria-label="Déconnexion"
              className="size-7 flex items-center justify-center rounded-sm text-muted-foreground
                         hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
