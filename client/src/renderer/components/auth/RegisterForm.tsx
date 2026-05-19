import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useRegister } from '../../hooks/useAuth'

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

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { mutate: register, isPending, error } = useRegister()

  const apiError = error as { code?: string; message?: string } | null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setConfirmError('Passwords do not match')
      return
    }
    setConfirmError('')
    register({ email, password })
  }

  const eyeButton = (visible: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="text-white/40 hover:text-white/80 transition-colors focus:outline-none"
      tabIndex={-1}
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      <EyeIcon open={visible} />
    </button>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
      {apiError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {apiError.code === 'AUTH_EMAIL_TAKEN'
            ? 'That email is already registered.'
            : apiError.message ?? 'Registration failed. Please try again.'}
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
      />

      <Input
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        minLength={8}
        required
        suffix={eyeButton(showPassword, () => setShowPassword(v => !v))}
      />

      <Input
        label="Confirm password"
        type={showConfirm ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat your password"
        autoComplete="new-password"
        error={confirmError}
        required
        suffix={eyeButton(showConfirm, () => setShowConfirm(v => !v))}
      />

      <Button type="submit" loading={isPending} className="w-full" size="lg">
        Create account
      </Button>

      <p className="text-center text-sm text-white/50">
        Already have an account?{' '}
        <Link to="/login" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
