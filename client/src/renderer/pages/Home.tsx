import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export function HomePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const activeProfile = useAuthStore((s) => s.activeProfile)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!activeProfile) return <Navigate to="/profiles" replace />
  return <Navigate to="/browse" replace />
}
