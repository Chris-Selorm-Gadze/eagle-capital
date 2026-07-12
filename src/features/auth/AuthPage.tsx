import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../../lib/supabaseClient'
import styles from './AuthPage.module.css'

export function AuthPage() {
  const { signUp, signIn } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = mode === 'signup' ? await signUp(email, password) : await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else if (mode === 'signup') {
      setSuccess('Account created — check your email to confirm, then sign in.')
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className={styles.root}>
        <h2 className={styles.title}>Sign in</h2>
        <p className={styles.subtitle}>
          Supabase isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>

      <form onSubmit={submit}>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </label>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.actions}>
          <button type="submit" className="btn-primary" disabled={submitting || !email || !password}>
            {mode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setSuccess(null) }}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </form>
    </div>
  )
}
