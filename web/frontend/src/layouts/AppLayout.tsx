import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { BottomNav } from '../components/BottomNav'

export function AppLayout() {
  return (
    <div className="relative min-h-svh bg-background bg-grid text-foreground overflow-hidden">
      {/* halo amber subtil en haut */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(245,165,36,0.08),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-50" />

      {/* Sidebar desktop (>= 1024px) */}
      <Sidebar />

      {/* Contenu principal */}
      <main className="relative lg:ml-64 pb-20 lg:pb-0 min-h-svh">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <BottomNav />
    </div>
  )
}
