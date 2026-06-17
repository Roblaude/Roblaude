import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { MissionsPage } from './pages/MissionsPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { NewMissionPage } from './pages/NewMissionPage'
import { AdminPage } from './pages/AdminPage'
import { AdminObjectsPage } from './pages/AdminObjectsPage'
import { ProfilePage } from './pages/ProfilePage'
import { MappingPage } from './pages/MappingPage'
import { AdminSshPage } from './pages/AdminSshPage'
import { RobotRepairPage } from './pages/RobotRepairPage'
import { LoginPage } from './pages/LoginPage'
import { DegradedModeBanner } from './components/DegradedModeBanner'
import { RequireAuth } from './components/RequireAuth'
import { useAuthStore } from './stores/authStore'
import { useWebSocket } from './hooks/useWebSocket'
import { useGlobalEffects } from './hooks/useGlobalEffects'

export default function App() {
  const role = useAuthStore((s) => s.user?.role)
  // ouvre la connexion WS au login, ferme au logout — singleton
  useWebSocket()
  // sons + notifs sur events critiques
  useGlobalEffects()
  return (
    <>
      <DegradedModeBanner />
    <BrowserRouter>
      <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<LoginPage />} />

        {/* Tout le reste est derriere le RequireAuth */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/missions" element={<MissionsPage />} />
            <Route path="/missions/new" element={<NewMissionPage />} />
            <Route path="/missions/:id" element={<MissionDetailPage />} />
            <Route
              path="/admin"
              element={role === 'ADMIN' ? <AdminPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/admin/objects"
              element={role === 'ADMIN' ? <AdminObjectsPage /> : <Navigate to="/" replace />}
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/mapping" element={<MappingPage />} />
            <Route path="/mapping/:robotId" element={<MappingPage />} />
            <Route
              path="/admin/ssh"
              element={role === 'ADMIN' ? <AdminSshPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/admin/repair"
              element={role === 'ADMIN' ? <RobotRepairPage /> : <Navigate to="/" replace />}
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
    </>
  )
}
