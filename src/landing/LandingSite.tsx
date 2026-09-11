import { useEffect } from 'react'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Link } from './components/Link'
import type { PublicLocation } from './routes'
import { FEATURE_PAGES } from './content'
import { Home } from './pages/Home'
import { Features } from './pages/Features'
import { FeatureDetail } from './pages/FeatureDetail'
import { HowItWorks } from './pages/HowItWorks'
import { Pricing } from './pages/Pricing'
import { Security } from './pages/Security'
import { About } from './pages/About'
import { Faq } from './pages/Faq'
import { Roadmap } from './pages/Roadmap'
import { Privacy, Terms } from './pages/Legal'
import { Disclaimer } from './pages/Disclaimer'
import './landing.css'

/* Per-route <title> and meta description. No helmet library — there are ten
 * routes and one effect covers them. */
const META: Record<string, { title: string; description: string }> = {
  home: {
    title: 'EagleCapital — Trading Desk for Multi-Account Traders',
    description:
      'Track prop-firm and live broker accounts in one dashboard. Trade journal, live MT5 sync, trade copier and pattern detection. No firm’s rules hardcoded. Start free.',
  },
  features: {
    title: 'Features — EagleCapital',
    description:
      'Twelve tools for multi-account traders: journal, prop-firm manager, MT5 sync, trade copier, pattern detection, playbooks and a daily report card.',
  },
  'how-it-works': {
    title: 'How it works — EagleCapital',
    description: 'From spreadsheet to trading desk in an afternoon. Five steps, ten minutes a day.',
  },
  pricing: {
    title: 'Pricing — EagleCapital',
    description:
      'Start free with unlimited accounts, trades and journaling. Pay only when you connect a live broker account.',
  },
  security: {
    title: 'Security & Data — EagleCapital',
    description:
      'Row-level security per user, isolated broker credential handling, conservative analytics, and full data export.',
  },
  about: { title: 'About — EagleCapital', description: 'Built by a trader who needed it.' },
  faq: { title: 'FAQ — EagleCapital', description: 'Questions about brokers, prop firms, pattern detection and risk — answered straight.' },
  roadmap: { title: 'Roadmap — EagleCapital', description: 'What’s shipped, what’s next, and what we’re still considering.' },
  disclaimer: { title: 'Risk disclaimer — EagleCapital', description: 'EagleCapital is a tracking and journaling tool, not financial advice.' },
  privacy: { title: 'Privacy — EagleCapital', description: 'What EagleCapital collects, who else processes it, and how to export or delete everything.' },
  terms: { title: 'Terms of service — EagleCapital', description: 'The agreement between you and EagleCapital.' },
}

function useDocumentMeta(location: PublicLocation) {
  useEffect(() => {
    let meta = META[location.kind]

    if (location.kind === 'feature' && location.slug) {
      const feature = FEATURE_PAGES.find((f) => f.slug === location.slug)
      if (feature) {
        meta = { title: `${feature.nav} — EagleCapital`, description: feature.subhead }
      }
    }

    if (!meta) return
    document.title = meta.title

    let tag = document.querySelector('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'description')
      document.head.appendChild(tag)
    }
    tag.setAttribute('content', meta.description)
  }, [location.kind, location.slug])
}

function renderPage(location: PublicLocation) {
  switch (location.kind) {
    case 'home': return <Home />
    case 'features': return <Features />
    case 'feature': return <FeatureDetail slug={location.slug!} />
    case 'how-it-works': return <HowItWorks />
    case 'pricing': return <Pricing />
    case 'security': return <Security />
    case 'about': return <About />
    case 'faq': return <Faq />
    case 'roadmap': return <Roadmap />
    case 'disclaimer': return <Disclaimer />
    case 'privacy': return <Privacy />
    case 'terms': return <Terms />
  }
}

export function LandingSite({ location }: { location: PublicLocation }) {
  useDocumentMeta(location)

  return (
    <div className="landingRoot">
      <div className="landingContent">
        <Nav />
        <main>{renderPage(location)}</main>
        <Footer />
      </div>
    </div>
  )
}

/** Shown for any unrecognised path. Kept in this file because it shares the
 * landing chrome and exists only as a routing fallback. */
export function NotFound() {
  useEffect(() => {
    document.title = 'Not found — EagleCapital'
  }, [])

  return (
    <div className="landingRoot">
      <div className="landingContent">
        <Nav />
        <main className="shell" style={{ padding: '8rem 0 10rem', textAlign: 'center' }}>
          <div className="micro" style={{ marginBottom: '1.5rem' }}>Error 404</div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.5rem)' }}>This page isn’t on the desk.</h1>
          <p style={{ marginTop: '1.4rem', color: 'var(--l-text-2)' }}>
            The link may be stale, or the page may have moved.
          </p>
          <div style={{ marginTop: '2.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="btnInk">Back to home</Link>
            <Link to="/features" className="btnGhost">Browse features</Link>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  )
}
