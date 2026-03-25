import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { BottomNav } from '../components/BottomNav'

export function AppLayout() {
  return (
    <div className="min-h-svh bg-gray-950 text-gray-100">
      {/* Sidebar desktop (> 1024px) — width 240px */}
      <Sidebar />

      {/* Contenu principal — décalé de la sidebar en desktop */}
      <main className="lg:ml-60 pb-16 lg:pb-0 min-h-svh">
        <Outlet />
      </main>

      {/* Bottom nav mobile (< 1024px) */}
      <BottomNav />
    </div>
  )
}
