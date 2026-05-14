import type { ComponentType } from 'react'
import { Routes as RouterRoutes, Route as RouterRoute, Navigate } from 'react-router-dom'
import { ChatPage } from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { useAuthStore } from './stores/authStore'

const Routes = RouterRoutes as ComponentType<Parameters<typeof RouterRoutes>[0]>
const Route = RouterRoute as ComponentType<Parameters<typeof RouterRoute>[0]>

export default function App() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  return (
    <>
      {/* Cyberpunk scan-line overlay */}
      <div className="scan-overlay" aria-hidden />

      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/" element={isAuthenticated ? <ChatPage /> : <Navigate to="/login" replace />} />
        <Route path="/room/:roomId" element={isAuthenticated ? <ChatPage /> : <Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
