import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import { useSettingsStore } from './store/settings'
import { LOCAL_PROFILE, LOCAL_PROFILE_ID } from './api/user'
import { UpdateNotification } from './components/UpdateNotification'

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
  const setActiveProfile = useAuthStore((s) => s.setActiveProfile)
  const { setTmdbApiKey, clearTmdbApiKey, setTmdbKeyHydrated } = useSettingsStore()

  // KokoMovie is fully local: there is no login. Seed a single on-device
  // identity so components that key off the active profile keep working.
  useEffect(() => {
    setAccount({ id: LOCAL_PROFILE_ID, email: 'local', plan: 'basic', mfaEnabled: false })
    setActiveProfile(LOCAL_PROFILE)
  }, [setAccount, setActiveProfile])

  // Hydrate the saved TMDB key (stored per-account in the OS keychain).
  useEffect(() => {
    setTmdbKeyHydrated(false)
    window.electronAPI?.getTmdbApiKey(LOCAL_PROFILE_ID)
      .then((key) => (key ? setTmdbApiKey(key) : clearTmdbApiKey()))
      .finally(() => setTmdbKeyHydrated(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Suspense fallback={<LoadingScreen />}>
      <UpdateNotification />
      <Routes>
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/series" element={<SeriesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/content/:id" element={<ContentDetailPage />} />
        <Route path="/player/:contentId" element={<PlayerPage />} />
        <Route path="/player/:contentId/:episodeId" element={<PlayerPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Legacy redirects → straight into the app */}
        <Route path="/home" element={<Navigate to="/browse" replace />} />
        <Route path="/login" element={<Navigate to="/browse" replace />} />
        <Route path="/register" element={<Navigate to="/browse" replace />} />
        <Route path="/profiles" element={<Navigate to="/browse" replace />} />
        <Route path="/" element={<Navigate to="/browse" replace />} />
        <Route path="*" element={<Navigate to="/browse" replace />} />
      </Routes>
    </Suspense>
  )
}
