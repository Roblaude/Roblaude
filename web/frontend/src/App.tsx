import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { MissionsPage } from './pages/MissionsPage'
import { MissionDetailPage } from './pages/MissionDetailPage'
import { NewMissionPage } from './pages/NewMissionPage'
import { AdminPage } from './pages/AdminPage'
import { ProfilePage } from './pages/ProfilePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { useAuthStore } from './stores/authStore'

export default function App() {
  const role = useAuthStore((s) => s.user?.role)
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes publiques */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Layout commun — sidebar desktop + bottom nav mobile */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/missions/new" element={<NewMissionPage />} />
          <Route path="/missions/:id" element={<MissionDetailPage />} />
          <Route
            path="/admin"
            element={role === 'ADMIN' ? <AdminPage /> : <Navigate to="/" replace />}
          />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
