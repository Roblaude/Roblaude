import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { BottomNav } from '../components/BottomNav'

export function AppLayout() {
  return (
    <div className="relative min-h-svh bg-background bg-grid text-foreground overflow-hidden">
      {/* Skip link WCAG — invisible, apparait au focus clavier (Tab) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4
                   focus:z-50 focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2
                   focus:text-sm focus:font-medium focus:text-white"
      >
        Aller au contenu principal
      </a>

      {/* halo amber subtil en haut */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(245,165,36,0.08),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-grain opacity-50" />

      {/* Sidebar desktop (>= 1024px) */}
      <Sidebar />

      {/* Contenu principal — id + tabIndex pour la cible du skip link */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative lg:ml-64 pb-20 lg:pb-0 min-h-svh focus:outline-none"
      >
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <BottomNav />
    </div>
  )
}
