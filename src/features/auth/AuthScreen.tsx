import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../../lib/supabaseClient'
import { Link } from '../../landing/components/Link'
import { navigate } from '../../landing/routes'
import { pathForNav } from '../../shared/routing'
import '../../landing/landing.css'
import styles from './AuthScreen.module.css'

/* The signed-out entry point used to be the whole app's first view (HomePage
 * rendered AuthPage directly). Auth now lives at its own /signin and /signup
 * routes, so the landing site is what a new visitor actually lands on. */

const PATH_AFTER_RESET = pathForNav('dashboard')

const COPY = {
  forgot: {
    title: 'Reset your password',
    sub: 'We’ll email you a link to set a new one.',
    submit: 'Send reset link',
    switchText: 'Remembered it?',
    switchCta: 'Sign in',
    switchTo: '/signin',
    meta: 'Reset your password — EagleCapital',
  },
  reset: {
    title: 'Choose a new password',
    sub: 'This replaces the password on your account.',
    submit: 'Save new password',
    switchText: 'Changed your mind?',
    switchCta: 'Sign in',
    switchTo: '/signin',
    meta: 'Choose a new password — EagleCapital',
  },
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

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset'

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const { signUp, signIn, requestPasswordReset, updatePassword } = useAuth()
  const copy = COPY[mode]

  // 'forgot' collects an email and no password; 'reset' collects a password and
  // no email. Everything else collects both.
  const wantsEmail = mode !== 'reset'
  const wantsPassword = mode !== 'forgot'

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
    const result = await runSubmit()
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }
    if (mode === 'signup') {
      setSuccess('Account created — check your email to confirm, then sign in.')
    } else if (mode === 'forgot') {
      // Deliberately the same message whether or not the address has an
      // account — saying "no such user" would turn this form into a way to
      // test which emails are registered.
      setSuccess('If that email has an account, a reset link is on its way.')
    } else if (mode === 'reset') {
      setSuccess('Password updated. Taking you to your desk…')
      setTimeout(() => navigate(PATH_AFTER_RESET), 1200)
    }
    // On a successful sign-in AuthGate swaps to the app on its own once the
    // session lands; no navigation needed here.
  }

  function runSubmit() {
    switch (mode) {
      case 'signup':
        return signUp(email, password)
      case 'forgot':
        return requestPasswordReset(email)
      case 'reset':
        return updatePassword(password)
      default:
        return signIn(email, password)
    }
  }

  return (
    <div className="landingRoot">

      <div className={`landingContent ${styles.split}`}>
        <div className={styles.formSide}>
          <Link to="/" className={styles.brandRow}>
            <img alt="EagleCapital" className={styles.logo} src="/eagle_logo.png" />
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
                  {wantsEmail && (
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
                  )}

                  {wantsPassword && (
                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <label className={styles.label} htmlFor="auth-password">
                          {mode === 'reset' ? 'New password' : 'Password'}
                        </label>
                        {mode === 'signin' && (
                          <Link className={styles.forgotLink} to="/forgot-password">
                            Forgot password?
                          </Link>
                        )}
                      </div>
                      <input
                        id="auth-password"
                        className={styles.input}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'signin' ? '••••••••' : 'At least 8 characters'}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        minLength={mode === 'signin' ? undefined : 8}
                        required
                      />
                    </div>
                  )}

                  {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}
                  {success && <div className={`${styles.message} ${styles.success}`}>{success}</div>}

                  <button
                    type="submit"
                    className={`btnInk ${styles.submit}`}
                    disabled={
                      submitting || (wantsEmail && !email) || (wantsPassword && !password)
                    }
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
                    <Link to="/terms">terms</Link>, <Link to="/privacy">privacy policy</Link> and{' '}
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
