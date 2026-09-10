import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../../lib/supabaseClient'
import { Link } from '../../landing/components/Link'
import { navigate } from '../../landing/routes'
import '../../landing/landing.css'
import styles from './AuthScreen.module.css'

/* The signed-out entry point used to be the whole app's first view (HomePage
 * rendered AuthPage directly). Auth now lives at its own /signin and /signup
 * routes, so the landing site is what a new visitor actually lands on. */

const COPY = {
  signin: {
    title: 'Welcome back',
    sub: 'Sign in to your desk.',
    submit: 'Sign in',
    switchText: 'Don’t have an account?',
    switchCta: 'Sign up',
    switchTo: '/signup',
    meta: 'Sign in — EagleCapital',
  },
  signup: {
    title: 'Create your account',
    sub: 'Free to start. No card.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchCta: 'Sign in',
    switchTo: '/signin',
    meta: 'Create your account — EagleCapital',
  },
} as const

const POINTS = [
  'Unlimited accounts and trades',
  'Journal, playbooks and report card',
  'Pattern detection on your own data',
  'No firm’s rules hardcoded',
]

export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const { signUp, signIn } = useAuth()
  const copy = COPY[mode]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = copy.meta
  }, [copy.meta])

  // Switching between sign-in and sign-up clears anything left over from the
  // previous attempt, so an old error doesn't hang over the new form.
  useEffect(() => {
    setError(null)
    setSuccess(null)
  }, [mode])

  async function submit(e: FormEvent) {
    e.preventDefault()
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
    // On a successful sign-in AuthGate swaps to the app on its own once the
    // session lands; no navigation needed here.
  }

  return (
    <div className="landingRoot">

      <div className={`landingContent ${styles.split}`}>
        <div className={styles.formSide}>
          <Link to="/" className={styles.brandRow}>
            <span className={styles.mark} aria-hidden="true">EC</span>
            <span className={styles.brandName}>EagleCapital</span>
          </Link>

          <div className={styles.formWrap}>
            <h1 className={styles.title}>{copy.title}</h1>
            <p className={styles.sub}>{copy.sub}</p>

            {!supabaseConfigured ? (
              <div className={`${styles.message} ${styles.error}`} style={{ marginTop: '2rem' }}>
                Supabase isn’t configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
                <code> .env.local</code> to enable sign-in.
              </div>
            ) : (
              <>
                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="auth-email">Email</label>
                    <input
                      id="auth-email"
                      className={styles.input}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="auth-password">Password</label>
                    <input
                      id="auth-password"
                      className={styles.input}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      minLength={mode === 'signup' ? 8 : undefined}
                      required
                    />
                  </div>

                  {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}
                  {success && <div className={`${styles.message} ${styles.success}`}>{success}</div>}

                  <button
                    type="submit"
                    className={`btnInk ${styles.submit}`}
                    disabled={submitting || !email || !password}
                  >
                    {submitting ? 'Working…' : copy.submit}
                  </button>
                </form>

                <div className={styles.switch}>
                  {copy.switchText}{' '}
                  <button
                    type="button"
                    className={styles.switchLink}
                    onClick={() => navigate(copy.switchTo)}
                  >
                    {copy.switchCta}
                  </button>
                </div>

                {mode === 'signup' && (
                  <p className={styles.legal}>
                    By creating an account you agree to our{' '}
                    <Link to="/disclaimer">risk disclaimer</Link>. EagleCapital is a tracking and
                    journaling tool, not financial advice.
                  </p>
                )}
              </>
            )}
          </div>

          <Link to="/" className={styles.backLink}>← Back to site</Link>
        </div>

        <aside className={styles.brandSide}>
          <p className={styles.pitch}>Every account. One desk.</p>
          <p className={styles.pitchSub}>
            Prop-firm evaluations, funded accounts and live broker accounts, side by side — with a
            journal that tells you the truth about how you traded.
          </p>

          <div className={styles.points}>
            {POINTS.map((p) => (
              <span key={p} className={styles.point}>
                <span className={styles.pointTick} aria-hidden="true" />
                {p}
              </span>
            ))}
          </div>

          <p className={styles.disclaimer}>
            Not financial advice. No firm’s rules are encoded here — every risk number is yours or
            your broker’s. Trading carries risk of loss.
          </p>
        </aside>
      </div>
    </div>
  )
}
