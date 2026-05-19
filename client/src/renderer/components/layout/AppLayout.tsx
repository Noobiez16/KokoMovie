import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

interface Props {
  children: React.ReactNode
  transparentNav?: boolean
}

export function AppLayout({ children, transparentNav = false }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeProfile, logout } = useAuthStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = document.getElementById('km-scroll-area')
    const onScroll = () => setScrolled((el?.scrollTop ?? 0) > 20)
    el?.addEventListener('scroll', onScroll)
    return () => el?.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navLinks = [
    {
      label: 'Home',
      path: '/browse',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    },
    {
      label: 'Movies',
      path: '/movies',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5m-1.5 0v-1.125m18.375 2.25v-1.125m0 1.125h-1.5m1.5 0a1.125 1.125 0 0 0 1.125-1.125M20.25 19.5h-1.5m1.5 0v-1.125m-18-10.875h18M3.75 6H20.25a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3.75 6Z" />
        </svg>
      ),
    },
    {
      label: 'Series',
      path: '/series',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h14.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      ),
    },
    {
      label: 'Downloads',
      path: '/downloads',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      ),
    },
  ]

  const settingsLinks = [
    {
      label: 'Providers',
      path: '/providers',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-3.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      ),
    },
    {
      label: 'Watch History',
      path: '/history',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ),
    },
  ]

  const isActive = (path: string) => location.pathname === path

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  const headerBg = transparentNav
    ? scrolled
      ? 'bg-km-bg/90 backdrop-blur-md border-b border-km-border/20'
      : 'bg-gradient-to-b from-km-bg/80 to-transparent'
    : 'bg-km-surface/40 backdrop-blur-md border-b border-km-border/20'

  return (
    <div className="flex h-screen bg-km-bg overflow-hidden text-km-text">
      {/* Left Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-km-surface/50 border-r border-km-border/30 backdrop-blur-xl z-50">
        {/* Logo */}
        <div className="h-16 px-6 flex items-center select-none">
          <button
            onClick={() => navigate('/browse')}
            className="flex items-center gap-2 group focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-violet-500/25 group-hover:scale-105 transition-transform duration-300">
              K
            </div>
            <span className="font-black text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-violet-300 via-fuchsia-300 to-white group-hover:opacity-90 transition-opacity">
              KOKOMOVIE
            </span>
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
          <div>
            <p className="px-3 text-[10px] font-bold text-violet-400/50 uppercase tracking-widest mb-2">Discover</p>
            <nav className="space-y-1">
              {navLinks.map((link) => {
                const active = isActive(link.path)
                return (
                  <button
                    key={link.path}
                    onClick={() => navigate(link.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                      active
                        ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 text-white border border-violet-500/20 shadow-inner'
                        : 'text-purple-300/60 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className={active ? 'text-violet-400' : 'text-purple-300/40 group-hover:text-purple-300 transition-colors'}>
                      {link.icon}
                    </span>
                    {link.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div>
            <p className="px-3 text-[10px] font-bold text-violet-400/50 uppercase tracking-widest mb-2">Library</p>
            <nav className="space-y-1">
              {settingsLinks.map((link) => {
                const active = isActive(link.path)
                return (
                  <button
                    key={link.path}
                    onClick={() => navigate(link.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
                      active
                        ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 text-white border border-violet-500/20 shadow-inner'
                        : 'text-purple-300/60 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className={active ? 'text-violet-400' : 'text-purple-300/40 group-hover:text-purple-300 transition-colors'}>
                      {link.icon}
                    </span>
                    {link.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Profile Card / Sign Out */}
        {activeProfile && (
          <div className="p-4 border-t border-km-border/30 bg-km-surface/20" ref={dropdownRef}>
            <div className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-md"
                    style={{
                      background: `linear-gradient(135deg, hsl(${activeProfile.name.charCodeAt(0) * 20}, 70%, 50%), hsl(${activeProfile.name.charCodeAt(0) * 20 + 40}, 70%, 40%))`
                    }}
                  >
                    {activeProfile.name[0]?.toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-white text-xs font-semibold truncate leading-none">{activeProfile.name}</p>
                    <p className="text-[10px] text-purple-300/50 mt-1 leading-none">
                      {activeProfile.isKids ? 'Kids Profile' : 'Standard'}
                    </p>
                  </div>
                </div>
                <svg
                  className={`w-3.5 h-3.5 text-purple-300/40 group-hover:text-purple-300 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {profileOpen && (
                <div className="absolute bottom-14 left-0 right-0 bg-[#120d24] border border-km-border/50 rounded-xl shadow-2xl py-1.5 z-50 backdrop-blur-xl animate-fade-in">
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/profiles') }}
                    className="w-full text-left px-4 py-2 text-purple-300/70 hover:text-white hover:bg-violet-600/20 text-xs font-medium transition-colors"
                  >
                    Switch Profile
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); logout() }}
                    className="w-full text-left px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors border-t border-km-border/30 mt-1 pt-1.5"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Floating Glassmorphic Header */}
        <header
          className={`flex-shrink-0 flex items-center justify-between px-8 h-16 z-40 transition-all duration-300 ${
            transparentNav ? 'absolute top-0 left-0 right-0' : ''
          } ${headerBg}`}
        >
          {/* Left: Search input */}
          <form onSubmit={handleSearch} className="relative w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies, series, genres..."
              className="w-full bg-km-surface-2/30 hover:bg-km-surface-2/50 focus:bg-km-surface-2/80 border border-km-border/40 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-purple-300/30 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 backdrop-blur-sm transition-all duration-300"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/35">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          </form>

          {/* Right: Info or Empty space */}
          <div className="flex items-center gap-4">
            {/* Any top-right widgets can go here */}
          </div>
        </header>

        {/* Scrollable pane */}
        <main id="km-scroll-area" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
