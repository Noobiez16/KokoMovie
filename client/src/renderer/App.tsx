import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { useSettingsStore } from './store/settings'
import { UpdateNotification } from './components/UpdateNotification'

const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/Register').then((m) => ({ default: m.RegisterPage })))
const ProfileSelectPage = lazy(() => import('./pages/ProfileSelect').then((m) => ({ default: m.ProfileSelectPage })))
const BrowsePage = lazy(() => import('./pages/Browse').then((m) => ({ default: m.BrowsePage })))
const MoviesPage = lazy(() => import('./pages/Movies').then((m) => ({ default: m.MoviesPage })))
const SeriesPage = lazy(() => import('./pages/Series').then((m) => ({ default: m.SeriesPage })))
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })))
const ContentDetailPage = lazy(() => import('./pages/ContentDetail').then((m) => ({ default: m.ContentDetailPage })))
const PlayerPage = lazy(() => import('./pages/Player').then((m) => ({ default: m.PlayerPage })))
const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const DownloadsPage = lazy(() => import('./pages/Downloads').then((m) => ({ default: m.DownloadsPage })))
const ProvidersPage = lazy(() => import('./pages/Providers').then((m) => ({ default: m.ProvidersPage })))

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-km-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold text-km-accent">KokoMovie</h1>
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    </div>
  )
}

export function App() {
  const setAccount = useAuthStore((s) => s.setAccount)
  const account = useAuthStore((s) => s.account)
  const { setTmdbApiKey, clearTmdbApiKey, setTmdbKeyHydrated } = useSettingsStore()

  useEffect(() => {
    setTmdbKeyHydrated(false)
    if (account?.id) {
      window.electronAPI?.getTmdbApiKey(account.id)
        .then((key) => {
          if (key) {
            setTmdbApiKey(key)
          } else {
            clearTmdbApiKey()
          }
        })
        .finally(() => setTmdbKeyHydrated(true))
    } else {
      clearTmdbApiKey()
      setTmdbKeyHydrated(true)
    }
  }, [account?.id])

  useEffect(() => {
    async function silentRefresh() {
      if (!account) return
      const refreshToken = await window.electronAPI?.getRefreshToken()
      if (!refreshToken) {
        setAccount(null)
        return
      }
      try {
        const { authApi } = await import('./api/auth')
        const res = await authApi.refresh(refreshToken)
        await window.electronAPI?.setAuthToken(res.data.accessToken)
        if (res.data.refreshToken) await window.electronAPI?.setRefreshToken(res.data.refreshToken)
      } catch (err: any) {
        if (err && (err.status === 400 || err.status === 401 || err.status === 403)) {
          setAccount(null)
        }
      }
    }
    silentRefresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Suspense fallback={<LoadingScreen />}>
      <UpdateNotification />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profiles" element={<AuthGuard><ProfileSelectPage /></AuthGuard>} />
        <Route path="/browse" element={<AuthGuard><BrowsePage /></AuthGuard>} />
        <Route path="/movies" element={<AuthGuard><MoviesPage /></AuthGuard>} />
        <Route path="/series" element={<AuthGuard><SeriesPage /></AuthGuard>} />
        <Route path="/search" element={<AuthGuard><SearchPage /></AuthGuard>} />
        <Route path="/content/:id" element={<AuthGuard><ContentDetailPage /></AuthGuard>} />
        <Route path="/player/:contentId" element={<AuthGuard><PlayerPage /></AuthGuard>} />
        <Route path="/player/:contentId/:episodeId" element={<AuthGuard><PlayerPage /></AuthGuard>} />
        <Route path="/downloads" element={<AuthGuard><DownloadsPage /></AuthGuard>} />
        <Route path="/history" element={<AuthGuard><HistoryPage /></AuthGuard>} />
        <Route path="/providers" element={<AuthGuard><ProvidersPage /></AuthGuard>} />
        <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
        {/* Legacy redirect */}
        <Route path="/home" element={<Navigate to="/browse" replace />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
