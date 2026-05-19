import { Navigate, Link } from 'react-router-dom'
import { LoginForm } from '../components/auth/LoginForm'
import { useAuthStore } from '../store/auth'

export function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const activeProfile = useAuthStore((s) => s.activeProfile)

  if (isAuthenticated && activeProfile) return <Navigate to="/browse" replace />
  if (isAuthenticated) return <Navigate to="/profiles" replace />

  return (
    <div className="min-h-screen bg-km-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#160d2c] via-km-bg to-[#0d0722]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-600/10 blur-[150px] rounded-full" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-violet-300 via-fuchsia-300 to-white tracking-wider">
            KOKOMOVIE
          </h1>
          <p className="text-purple-300/40 text-xs mt-1 uppercase tracking-widest font-semibold">Stream anything, anywhere</p>
        </div>

        {/* Card */}
        <div className="bg-km-surface/40 backdrop-blur-xl rounded-2xl p-8 border border-km-border/50 shadow-2xl">
          <h2 className="text-white text-xl font-bold mb-6">Sign in</h2>
          <LoginForm />
          <p className="text-purple-300/45 text-sm text-center mt-6">
            No account?{' '}
            <Link to="/register" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
