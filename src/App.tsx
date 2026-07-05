import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { roomToTrail } from './domain/apex'
import { ddLimits, type FnModel } from './domain/fundednext'
import { riskPerTrade, dailyStop } from './domain/risk'

// Milestone 1 shell: proves the data layer + domain math work end to end.
// See PLAN.md for what to build next.
export default function App() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Prop Tracker</h1>
      <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
            <th>Account</th><th>Stage</th><th>Balance</th><th>Risk/Trade</th><th>Daily Stop</th><th>Room Left</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const isApex = a.firm === 'apex'
            const maxDd = isApex ? 6_500 : ddLimits(a.model as FnModel, a.size).maxLoss
            const firmDaily = isApex ? null : ddLimits(a.model as FnModel, a.size).dailyLoss
            const room = isApex
              ? roomToTrail(a.balance, a.highestBalance, a.stage === 'pa' ? 'pa' : 'evaluation', a.platform)
              : a.balance - (a.size - maxDd)
            return (
              <tr key={a.id} style={{ borderBottom: '1px solid #ddd', color: room < maxDd * 0.3 ? '#c00' : undefined }}>
                <td>{a.label}</td>
                <td>{a.stage}</td>
                <td>${a.balance.toLocaleString()}</td>
                <td>${riskPerTrade(maxDd).toLocaleString()}</td>
                <td>${dailyStop(firmDaily, maxDd).toLocaleString()}</td>
                <td>${room.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
