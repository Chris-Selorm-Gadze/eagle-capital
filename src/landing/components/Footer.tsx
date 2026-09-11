import { Link } from './Link'
import { FOOTER_DISCLAIMER } from '../content'
import styles from './Footer.module.css'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/features', label: 'Features' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/how-it-works', label: 'How it works' },
      { to: '/roadmap', label: 'Roadmap' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/security', label: 'Security' },
      { to: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/signin', label: 'Sign in' },
      { to: '/signup', label: 'Create account' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: '/disclaimer', label: 'Risk disclaimer' },
    ],
  },
]

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.top}`}>
        <div className={styles.brandBlock}>
          <Link to="/" className={styles.brandRow}>
            <img alt="EagleCapital" className={styles.logo} src="/eagle_logo.png" />
          </Link>
          <p className={styles.tagline}>
            The trading desk for people who run more than one account.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className={styles.colTitle}>{col.title}</div>
            <div className={styles.col}>
              {col.links.map((l) => (
                <Link key={l.to} to={l.to} className={styles.colLink}>{l.label}</Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`shell ${styles.bottom}`}>
        <p className={styles.disclaimer}>{FOOTER_DISCLAIMER}</p>
        <div className={styles.copyright}>
          © 2026 EagleCapital · Not affiliated with any prop firm or broker
        </div>
      </div>
    </footer>
  )
}
