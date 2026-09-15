/* Pins the time zone for the whole suite.
 *
 * Several modules exist specifically to get local-vs-UTC day boundaries right
 * (utils/tradingDay.ts, the CSV importer's broker-offset handling). A test for
 * that logic is meaningless when it runs in UTC — local and UTC agree, so the
 * bug it guards against can't reproduce — and it would silently pass in CI
 * while the real defect went unnoticed.
 *
 * America/New_York is chosen because it's west of UTC (so an evening trade
 * falls on the next UTC day, which is the actual failure case) and observes DST
 * (so date arithmetic gets exercised across a transition).
 *
 * Node re-reads process.env.TZ at runtime, so setting it here — before any test
 * module is imported — is enough; it does not need to be set on the command
 * line. */
process.env.TZ = 'America/New_York'
