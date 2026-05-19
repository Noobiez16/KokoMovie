import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useLogin } from '../../hooks/useAuth'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [needsMfa, setNeedsMfa] = useState(false)
  const { mutate: login, isPending, error } = useLogin()

  const apiError = error as { code?: string; message?: string } | null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ email, password, mfaToken: needsMfa ? mfaToken : undefined })
  }

  // Detect MFA requirement
  if (apiError?.code === 'AUTH_MFA_REQUIRED' && !needsMfa) {
    setNeedsMfa(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
      {apiError && apiError.code !== 'AUTH_MFA_REQUIRED' && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {apiError.message ?? 'Sign in failed. Please try again.'}
        </div>
      )}

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
        disabled={needsMfa}
      />

      <Input
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your password"
        autoComplete="current-password"
        required
        disabled={needsMfa}
        suffix={
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="text-white/40 hover:text-white/80 transition-colors focus:outline-none"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        }
      />

      {needsMfa && (
        <div className="animate-slide-up">
          <Input
            label="Authentication code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={mfaToken}
            onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
            error={apiError?.code === 'AUTH_MFA_INVALID' ? 'Invalid code, try again' : undefined}
          />
          <p className="text-xs text-white/50 mt-1">Enter the 6-digit code from your authenticator app.</p>
        </div>
      )}

      <Button type="submit" loading={isPending} className="w-full" size="lg">
        {needsMfa ? 'Verify' : 'Sign in'}
      </Button>

      {needsMfa && (
        <button
          type="button"
          className="text-sm text-white/50 hover:text-white/80 w-full text-center"
          onClick={() => setNeedsMfa(false)}
        >
          ← Back
        </button>
      )}

      {!needsMfa && (
        <p className="text-center text-sm text-white/50">
          New to KokoMovie?{' '}
          <Link to="/register" className="text-white hover:underline">
            Create account
          </Link>
        </p>
      )}
    </form>
  )
}
