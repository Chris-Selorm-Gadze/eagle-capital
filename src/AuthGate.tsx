import { useEffect, lazy, Suspense } from 'react'
import { useAuth } from './features/auth/AuthContext'
import { usePath, publicLocationFor, isAuthPath, navigate } from './landing/routes'
import { pathForNav, isAppPath } from './shared/routing'

// The three surfaces are split apart so none pays for the others: a visitor
// reading the marketing site doesn't download the app's charting stack, and a
// signed-in user opening the dashboard doesn't download the landing pages.
const App = lazy(() => import('./App'))
const AuthScreen = lazy(() => import('./features/auth/AuthScreen').then((m) => ({ default: m.AuthScreen })))
const LandingSite = lazy(() => import('./landing/LandingSite').then((m) => ({ default: m.LandingSite })))
const NotFound = lazy(() => import('./landing/LandingSite').then((m) => ({ default: m.NotFound })))

/* Top-level router. Three surfaces share one origin:
 *   · the public marketing site  — '/', '/features', '/pricing', …
 *   · auth                       — '/signin', '/signup'
 *   · the authenticated app      — '/dashboard' and the other nav paths
 *
 * The app used to own '/' and render the auth form as its first view. The
 * landing site owns '/' now, and the app moved to '/dashboard'. */

export function AuthGate() {
  const { user, loading } = useAuth()
  const path = usePath()

  const onAuthRoute = isAuthPath(path)
  const publicLocation = publicLocationFor(path)

  // A signed-in user has no business on /signin or /signup — bounce them to
  // the app. Done in an effect so it's a real navigation, not a render-time
  // side effect.
  //
  // /reset-password is exempt: arriving from a recovery email *is* a signed-in
  // state (Supabase creates a recovery session from the link), so bouncing
  // would make the password form unreachable — the exact thing it's there for.
  const onResetRoute = path === '/reset-password'
  useEffect(() => {
    if (!loading && user && onAuthRoute && !onResetRoute) navigate(pathForNav('dashboard'))
  }, [loading, user, onAuthRoute, onResetRoute])

  // Equally, an app route with no session goes to sign-in rather than
  // rendering App and letting it crash on `user!.id`. Scoped to real app paths
  // so an unknown URL gets a 404 instead of being bounced to sign-in.
  useEffect(() => {
    if (!loading && !user && isAppPath(path)) navigate('/signin')
  }, [loading, user, path])

  if (loading) return null

  // Which ground this route's chunk is about to paint, so the holding frame
  // stands in for the right one.
  const publicGround = publicLocation !== null || onAuthRoute

  return <Suspense fallback={<SurfaceFallback publicGround={publicGround} />}>{renderSurface()}</Suspense>

  function renderSurface() {
    // Marketing pages render for everyone — a signed-in visitor can still read
    // the pricing page; the nav just offers "Open app" instead of "Sign up".
    if (publicLocation) return <LandingSite location={publicLocation} />

    if (onAuthRoute) {
      if (onResetRoute) return <AuthScreen mode="reset" />
      if (user) return null // redirecting to the app
      if (path === '/forgot-password') return <AuthScreen mode="forgot" />
      return <AuthScreen mode={path === '/signup' ? 'signup' : 'signin'} />
    }

    if (isAppPath(path)) {
      if (!user) return null // redirecting to /signin
      return <App />
    }

    // Neither a marketing page, an auth page, nor an app route.
    return <NotFound />
  }
}

/** Deliberately just the page ground, no spinner — these chunks resolve in
 * milliseconds and a flashed spinner reads worse than a beat of nothing.
 *
 * This painted #070707 for the landing and auth routes, left over from when
 * every surface was near-black. Both were flipped to light — landing.css sets
 * `--l-bg: #faf9f7` and the auth form side sits on it — but this was never
 * updated, so every visit to the marketing site and every sign-in flashed a
 * near-black frame before a near-white page. The one case the old code got
 * right was the app.
 *
 * The public surfaces are single-theme by design, so their ground is a literal
 * matching `--l-bg` (it is scoped inside `.landingRoot`, which hasn't mounted
 * yet at this point, so the variable isn't readable here). The app follows
 * `--page-bg`, which is now light or dark depending on the theme. */
function SurfaceFallback({ publicGround }: { publicGround: boolean }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: publicGround ? '#faf9f7' : 'var(--page-bg)',
      }}
    />
  )
}
