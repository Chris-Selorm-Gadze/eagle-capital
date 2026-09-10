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
  useEffect(() => {
    if (!loading && user && onAuthRoute) navigate(pathForNav('dashboard'))
  }, [loading, user, onAuthRoute])

  // Equally, an app route with no session goes to sign-in rather than
  // rendering App and letting it crash on `user!.id`. Scoped to real app paths
  // so an unknown URL gets a 404 instead of being bounced to sign-in.
  useEffect(() => {
    if (!loading && !user && isAppPath(path)) navigate('/signin')
  }, [loading, user, path])

  if (loading) return null

  return <Suspense fallback={<SurfaceFallback />}>{renderSurface()}</Suspense>

  function renderSurface() {
    // Marketing pages render for everyone — a signed-in visitor can still read
    // the pricing page; the nav just offers "Open app" instead of "Sign up".
    if (publicLocation) return <LandingSite location={publicLocation} />

    if (onAuthRoute) {
      if (user) return null // redirecting to the app
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
 * milliseconds and a flashed spinner reads worse than a beat of nothing. */
function SurfaceFallback() {
  return <div style={{ minHeight: '100vh', backgroundColor: '#070707' }} />
}
