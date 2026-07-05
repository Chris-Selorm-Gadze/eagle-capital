import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from './db/schema'
import { todayISO } from './db/sessions'
import { AccountCard } from './components/AccountCard'
import { EditAccountDialog } from './components/EditAccountDialog'
import { LogSessionDialog } from './components/LogSessionDialog'
import { effectiveBreakerLevels } from './lib/breaker'

const FIRM_LABEL: Record<Account['firm'], string> = {
  fundednext: 'FundedNext',
  apex: 'Apex',
}

export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const sessions = useLiveQuery(() => db.sessions.toArray()) ?? []
  const [editing, setEditing] = useState<Account | null>(null)
  const [logging, setLogging] = useState<Account | null>(null)

  const sessionsByAccountId = new Map<number, typeof sessions>()
  for (const s of sessions) {
    const list = sessionsByAccountId.get(s.accountId) ?? []
    list.push(s)
    sessionsByAccountId.set(s.accountId, list)
  }
  const breakerLevels = effectiveBreakerLevels(accounts, sessionsByAccountId, todayISO())

  const byFirm = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    ;(acc[a.firm] ??= []).push(a)
    return acc
  }, {})

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Prop Tracker</h1>

      {(Object.keys(byFirm) as Account['firm'][]).map((firm) => (
        <section key={firm} style={{ marginBottom: '2rem' }}>
          <h2>{FIRM_LABEL[firm]}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {byFirm[firm].map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                breaker={breakerLevels.get(a.id!) ?? 'ok'}
                onEdit={() => setEditing(a)}
                onLogSession={() => setLogging(a)}
              />
            ))}
          </div>
        </section>
      ))}

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
      {logging && <LogSessionDialog account={logging} onClose={() => setLogging(null)} />}
    </main>
  )
}
