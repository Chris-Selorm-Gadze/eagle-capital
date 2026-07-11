import styles from './MetaApiCredentialFields.module.css'

/** Shared MT5/MetaApi login form — used both by the Broker Connections page (reporting-only or
 * copier-follower connections) and by AddAccountDialog's "live account" flow (which additionally
 * fetches real balance/currency from the same credentials once verified). */
export function MetaApiCredentialFields({ login, setLogin, password, setPassword, server, setServer }: {
  login: string; setLogin: (v: string) => void
  password: string; setPassword: (v: string) => void
  server: string; setServer: (v: string) => void
}) {
  return (
    <>
      <p className={styles.hint}>
        Use the <strong>investor password</strong> for reporting only. Use the <strong>trading
        password</strong> if this account will receive copied trades as a follower.
      </p>
      <label className="field">
        Login (account number)
        <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        Server
        <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="e.g. Exness-MT5Real8" />
      </label>
    </>
  )
}
