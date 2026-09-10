import { Link } from '../components/Link'
import { Reveal } from '../components/Reveal'
import { ProductPreview } from '../components/ProductPreview'
import { TOOLS, TRUST_POINTS, PAIN_POINTS, STEPS } from '../content'
import styles from './Home.module.css'

export function Home() {
  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className={styles.hero}>

        <div className={`shell ${styles.heroGrid}`}>
          <div>
            <Reveal immediate>
              <div className={`micro ${styles.eyebrow}`}>Built for multi-account traders</div>
            </Reveal>

            <Reveal delay={80} immediate>
              <h1 className={styles.h1}>
                Every account.<br />
                <span className={styles.h1Accent}>One desk.</span>
              </h1>
            </Reveal>

            <Reveal delay={160} immediate>
              <p className={styles.sub}>
                Track prop-firm evaluations, funded accounts and live broker accounts side by
                side. Journal every trade. Stream live positions. Copy orders between accounts.
                No firm’s rules hardcoded — because yours will change.
              </p>
            </Reveal>

            <Reveal delay={240} immediate>
              <div className={styles.heroCtas}>
                <Link to="/signup" className="btnInk">Start free</Link>
                <Link to="/how-it-works" className="btnGhost">See how it works</Link>
              </div>
              <p className={styles.footnote}>No card required. Your data stays yours.</p>
            </Reveal>
          </div>

          <Reveal delay={280} immediate>
            <ProductPreview />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- trust strip */}
      <div className={styles.trust}>
        <div className={`shell ${styles.trustRow}`}>
          {TRUST_POINTS.map((p) => (
            <span key={p} className={styles.trustItem}>{p}</span>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- problem */}
      <section className="section">
        <div className="shell">
          <Reveal className={styles.head}>
            <div className={`micro ${styles.kicker}`}>The problem</div>
            <h2 className={styles.h2}>Running four accounts shouldn’t take four hours.</h2>
            <p className={styles.lede}>
              You passed the evaluation. Then you took a second one. Then a funded account, then
              a live account to trade your own size. Now your P&amp;L lives in a spreadsheet, your
              rules live in your head, your screenshots live in a folder called “screenshots”, and
              the only thing tracking your drawdown is your pulse.
            </p>
          </Reveal>

          <div className={styles.pains}>
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.n} delay={i * 90}>
                <div className={styles.pain}>
                  <h3 className={styles.painTitle}>{p.title}</h3>
                  <p className={styles.painBody}>{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- how it works */}
      <section className="section bandTint">
        <div className="shell">
          <Reveal className={styles.head}>
            <div className={`micro ${styles.kicker}`}>How it works</div>
            <h2 className={styles.h2}>Three steps to a real trading desk.</h2>
          </Reveal>

          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 70} className={styles.step}>
                <div className={styles.stepN}>Step {s.n}</div>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- tools */}
      <section className="section">
        <div className="shell">
          <Reveal className={styles.head}>
            <div className={`micro ${styles.kicker}`}>The suite</div>
            <h2 className={styles.h2}>Twelve tools. One login.</h2>
            <p className={styles.lede}>Not a roadmap. All of this is built.</p>
          </Reveal>

          <div className={styles.tools}>
            {TOOLS.map((t, i) => (
              <Reveal key={t.n} delay={(i % 3) * 70} className={styles.tool}>
                <h3 className={styles.toolName}>{t.name}</h3>
                <p className={styles.toolBody}>{t.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------- deep dive: agnostic */}
      <section className="section bandTop">
        <div className={`shell ${styles.dive}`}>
          <Reveal>
            <div className={`micro ${styles.kicker}`}>The core design decision</div>
            <h2 className={styles.h2}>We don’t hardcode a single firm’s rules. On purpose.</h2>
            <div className={styles.diveBody}>
              <p>
                Most prop trackers ship with FTMO’s rules, Apex’s rules, Topstep’s rules baked in.
                Then a firm changes its trailing drawdown policy on a Tuesday and the tool quietly
                lies to you.
              </p>
              <p>
                EagleCapital takes the other path. Your risk limits are fields you fill in. Your
                payouts and rewards are entries you make. Your execution checklist is built from
                rules you wrote. Nothing is computed from a firm’s rulebook, because rulebooks
                change and yours is the only one that has to be right.
              </p>
              <p>
                It means five minutes of setup. It also means the tool still tells the truth after
                your firm updates its terms — and it works exactly the same when you move to a firm
                we’ve never heard of.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <blockquote className={styles.quote}>
              “Every number is either yours, or it came live from your broker.”
            </blockquote>
            <div className={`card ${styles.panel}`} style={{ marginTop: '1.75rem' }}>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Risk limits</span>
                <span className={styles.panelVal}>Fields you fill in. Never auto-filled, never inferred.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Payouts &amp; rewards</span>
                <span className={styles.panelVal}>Plain entries you control, across any firm.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Execution checklist</span>
                <span className={styles.panelVal}>Generated from the rules you wrote yourself.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Firm catalogue</span>
                <span className={styles.panelVal}>Labels only. Adding a firm encodes none of its rules.</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------- deep dive: patterns */}
      <section className="section bandTop">
        <div className={`shell ${styles.dive} ${styles.diveFlip}`}>
          <Reveal>
            <div className={`micro ${styles.kicker}`}>AI Insights</div>
            <h2 className={styles.h2}>Feedback that doesn’t need an API key.</h2>
            <div className={styles.diveBody}>
              <p>
                Most “AI trading coaches” are one prompt in a trenchcoat. EagleCapital splits it in
                two.
              </p>
              <p>
                The free layer is deterministic. It reads your trade log and flags revenge trading,
                overtrading and size escalation — with the specific trades as evidence. No API call,
                no waiting, no cost, and the same input always gives the same answer.
              </p>
              <p>
                The second layer is a coaching digest you trigger yourself, when you want the longer
                read. It runs server-side and your API key never touches the browser.
              </p>
            </div>
            <div className={styles.diveCta}>
              <Link to="/features/ai-insights" className="btnGhost">Read more</Link>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className={`card ${styles.panel}`}>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Revenge trading</span>
                <span className={styles.panelVal}>Trades taken too soon after a loss.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Overtrading days</span>
                <span className={styles.panelVal}>Days well above your own normal volume.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Size escalation</span>
                <span className={styles.panelVal}>Position size climbing after a losing trade.</span>
              </div>
              <div className={styles.honest}>
                <div className={styles.honestTitle}>Every flag cites its trades</div>
                <p className={styles.honestBody}>
                  Nothing is asserted without the fills behind it. You can go look.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------- deep dive: copier */}
      <section className="section bandTop">
        <div className={`shell ${styles.dive}`}>
          <Reveal>
            <div className={`micro ${styles.kicker}`}>Trade Copier</div>
            <h2 className={styles.h2}>One entry. Every account.</h2>
            <div className={styles.diveBody}>
              <p>
                Group a master account and its followers, and orders mirror in real time across your
                connected MT4/5 accounts. Watch live P&amp;L per account over WebSocket. Set a risk
                profile that stops a follower out on its own terms. Flatten everything with one
                button.
              </p>
            </div>

            <div className={styles.honest}>
              <div className={styles.honestTitle}>What it doesn’t do</div>
              <p className={styles.honestBody}>
                Copying runs on MetaApi’s CopyFactory, which is MT4/5 only. Futures accounts —
                Tradovate, Topstep and the like — can be tracked and synced but not copied. We’d
                rather tell you now than at the fill.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className={`card ${styles.panel}`}>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Master / follower</span>
                <span className={styles.panelVal}>Groups you configure per strategy.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Live P&amp;L</span>
                <span className={styles.panelVal}>Per account, streaming over WebSocket.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Risk stopouts</span>
                <span className={styles.panelVal}>Per-follower profiles, with unlock when you’re ready.</span>
              </div>
              <div className={styles.panelRow}>
                <span className={styles.panelKey}>Flatten-all</span>
                <span className={styles.panelVal}>For the day it’s needed.</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section className="section bandTop">
        <div className="shell">
          <Reveal className={styles.head}>
            <div className={`micro ${styles.kicker}`}>Security</div>
            <h2 className={styles.h2}>Your data is yours, and it’s scoped to you.</h2>
            <p className={styles.lede}>
              Every table is row-level-secured to your user ID at the database level, not just
              hidden in the UI. Broker credentials never pass through the browser to storage — they
              go straight to an isolated sync service. Analytics are deliberately conservative: no
              session replay, and text and attributes are masked, because this screen shows real
              balances.
            </p>
            <div className={styles.diveCta}>
              <Link to="/security" className="btnGhost">Read how we handle your data</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- final cta */}
      <section className={`${styles.final} bandTop`}>
        <div className="shell">
          <Reveal className={styles.finalInner}>
            <h2 className={styles.finalH}>Put the whole book on one screen.</h2>
            <p className={styles.finalSub}>
              Free to start. No card. Export your data whenever you want it.
            </p>
            <div className={styles.finalCtas}>
              <Link to="/signup" className="btnInk">Create your account</Link>
              <Link to="/features" className="btnGhost">Browse the features</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
