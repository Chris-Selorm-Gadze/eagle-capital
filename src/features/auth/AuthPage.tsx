import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { supabaseConfigured } from '../../lib/supabaseClient'
import { setupNotice } from '../../shared/setupNotice'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorNotice } from '@/shared/ui/page'

/* The inline signed-out fallback embedded in four app pages (TopNav, Broker
 * Connections, Trade Copier, Live Trading). Distinct from AuthScreen.tsx, which
 * is the standalone /signin and /signup route.
 *
 * Converted off bare `<input>` / `<button>` elements, which had no styling of
 * their own at all — they were painted entirely by theme.css's `.appSurface`
 * element rules. That was invisible until the first page converted and left the
 * wrapper behind, at which point this form would have rendered as browser
 * defaults. It owns its appearance now, so it renders the same inside the
 * wrapper or out of it, and the remaining three pages can convert freely. */

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
      <Card className="mx-auto my-12 w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {setupNotice(
              'Sign-in is temporarily unavailable. Please try again in a few minutes.',
              ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const signingUp = mode === 'signup'

  return (
    <Card className="mx-auto my-12 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{signingUp ? 'Create an account' : 'Sign in'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            {/* Explicit htmlFor/id rather than the old wrapping <label>: these ids
                are unique on the page because this form renders at most once. */}
            <Label htmlFor="inline-auth-email">Email</Label>
            <Input
              autoComplete="email"
              id="inline-auth-email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inline-auth-password">Password</Label>
            <Input
              // Was always "current-password", so a password manager offered to
              // fill an existing password on the sign-up path instead of
              // generating a new one.
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              id="inline-auth-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              value={password}
            />
          </div>

          {error && <ErrorNotice message={error} />}
          {success && (
            <p className="text-(--good-deep) text-sm" role="status">
              {success}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={submitting || !email || !password} type="submit">
              {submitting ? 'Working…' : signingUp ? 'Sign up' : 'Sign in'}
            </Button>
            <Button
              className="px-0"
              onClick={() => {
                setMode(signingUp ? 'signin' : 'signup')
                setError(null)
                setSuccess(null)
              }}
              size="sm"
              type="button"
              variant="link"
            >
              {signingUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
