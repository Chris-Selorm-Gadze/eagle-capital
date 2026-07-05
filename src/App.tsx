import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Account } from './db/schema'
import { AccountCard } from './components/AccountCard'
import { EditAccountDialog } from './components/EditAccountDialog'

const FIRM_LABEL: Record<Account['firm'], string> = {
  fundednext: 'FundedNext',
  apex: 'Apex',
}

export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const [editing, setEditing] = useState<Account | null>(null)

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
              <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} />
            ))}
          </div>
        </section>
      ))}

      {editing && <EditAccountDialog account={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}
