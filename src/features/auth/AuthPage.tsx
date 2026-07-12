import { useState } from 'react'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../../lib/supabaseClient'
import { usePostHog } from '@posthog/react'
import styles from './AuthPage.module.css'

export function AuthPage() {
  const { signUp, signIn } = useAuth()
  const posthog = usePostHog()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const result = mode === 'signup' ? await signUp(email, password) : await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else if (mode === 'signup') {
      posthog?.capture('signed_up')
      setSuccess('Account created — check your email to confirm, then sign in.')
    } else {
      posthog?.capture('signed_in')
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

      <label className="field">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="field">
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </label>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.actions}>
        <button className="btn-primary" onClick={submit} disabled={submitting || !email || !password}>
          {mode === 'signup' ? 'Sign up' : 'Sign in'}
        </button>
        <button
          className={styles.toggle}
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setSuccess(null) }}
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  )
}
