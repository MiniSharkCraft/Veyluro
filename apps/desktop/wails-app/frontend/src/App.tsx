import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ChatPage }       from './pages/ChatPage'
import { LoginPage }      from './pages/LoginPage'
import { RecoverKeyPage } from './pages/RecoverKeyPage'
import { useAuthStore }   from './stores/authStore'

export default function App() {
  const { isAuthenticated, needsKeyRecovery, restoreSession } = useAuthStore()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    restoreSession().finally(() => setBooting(false))
  }, [restoreSession])

  if (booting) {
    return <div className="h-screen bg-[var(--app-bg)]" />
  }

  return (
    <>
      <div className="scan-overlay" aria-hidden />
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated          ? <Navigate to="/" replace /> :
            needsKeyRecovery         ? <Navigate to="/recover-key" replace /> :
            <LoginPage />
          }
        />
        <Route
          path="/recover-key"
          element={needsKeyRecovery ? <RecoverKeyPage /> : <Navigate to={isAuthenticated ? '/' : '/login'} replace />}
        />
        <Route
          path="/*"
          element={
            isAuthenticated    ? <ChatPage /> :
            needsKeyRecovery   ? <Navigate to="/recover-key" replace /> :
            <Navigate to="/login" replace />
          }
        />
      </Routes>
    </>
  )
}
