import { useEffect, useState } from 'react'
import { Link } from './Link'
import { usePath } from '../routes'
import { useAuth } from '../../features/auth/AuthContext'
import styles from './Nav.module.css'

const NAV_LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/security', label: 'Security' },
  { to: '/faq', label: 'FAQ' },
]

export function Nav() {
  const path = usePath()
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Any route change closes the panel — otherwise tapping a link on mobile
  // navigates behind an still-open overlay.
  useEffect(() => {
    setMenuOpen(false)
  }, [path])

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={`shell ${styles.bar}`}>
        <Link to="/" className={styles.brand} aria-label="EagleCapital home">
          <img alt="EagleCapital" className={styles.logo} src="/eagle_logo.png" />
        </Link>

        <nav className={styles.links} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`${styles.link} ${path.startsWith(l.to) ? styles.linkActive : ''}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* A signed-in visitor browsing the marketing site shouldn't be asked
            to sign up again — send them back to the app instead. */}
        <div className={styles.actions}>
          {user ? (
            <Link to="/dashboard" className={`btnInk ${styles.navCta}`}>Open app</Link>
          ) : (
            <>
              <Link to="/signin" className={styles.signIn}>Sign in</Link>
              <Link to="/signup" className={`btnInk ${styles.navCta}`}>Get started</Link>
            </>
          )}
        </div>

        <button
          type="button"
          className={`${styles.menuBtn} ${menuOpen ? styles.menuOpen : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          <span className={styles.menuBar} />
          <span className={styles.menuBar} />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobilePanel} id="landing-mobile-menu">
          <div className={`shell ${styles.mobileInner}`}>
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className={styles.mobileLink}>{l.label}</Link>
            ))}
            <div className={styles.mobileActions}>
              {user ? (
                <Link to="/dashboard" className="btnInk">Open app</Link>
              ) : (
                <>
                  <Link to="/signin" className="btnGhost">Sign in</Link>
                  <Link to="/signup" className="btnInk">Get started</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
