import styles from './EconomicCalendarPage.module.css'

// Investing.com's free public economic-calendar embed — no API key/signup, same
// no-backend embed pattern as the TradingView chart widget. "features=timezone" turns on
// an in-widget timezone picker so we don't have to guess the user's zone from our side;
// "features=datepicker" lets them page through days/weeks/months on their own.
// countries=5 is Investing.com's own id for United States — filters the calendar to US events.
const CALENDAR_URL =
  'https://sslecal2.investing.com/?columns=exc_flag,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous' +
  '&features=datepicker,timezone' +
  '&countries=5' +
  '&calType=week&lang=1'

export function EconomicCalendarPage() {
  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>Economic Calendar</h1>
      <p className={styles.hint}>
        US events only. This is Investing.com's own embed — it's a cross-origin frame, so its
        internal colors can't be restyled to match the app theme (same limitation as the
        TradingView chart).
      </p>
      <div className="card">
        <div className={styles.frameInner}>
          <iframe src={CALENDAR_URL} title="Economic Calendar" className={styles.frame} />
        </div>
      </div>
    </div>
  )
}
