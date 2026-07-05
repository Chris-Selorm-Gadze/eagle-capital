import { TileShell } from './TileShell'

export function AvgWinLossBarTile({
  label,
  info,
  ratio,
  avgWin,
  avgLoss,
}: {
  label: string
  info?: string
  ratio: string
  avgWin: number
  avgLoss: number
}) {
  const winMag = Math.abs(avgWin)
  const lossMag = Math.abs(avgLoss)
  const total = winMag + lossMag
  const winFlex = total > 0 ? winMag : 1
  const lossFlex = total > 0 ? lossMag : 1

  return (
    <TileShell label={label} info={info}>
      <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.15rem', color: 'var(--text-primary)' }}>{ratio}</div>
      <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', marginTop: '0.6rem' }}>
        <div style={{ flex: winFlex, background: 'var(--good)' }} />
        <div style={{ flex: lossFlex, background: 'var(--critical)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginTop: '0.3rem' }}>
        <span style={{ color: 'var(--good)' }}>${Math.round(winMag).toLocaleString()}</span>
        <span style={{ color: 'var(--critical)' }}>-${Math.round(lossMag).toLocaleString()}</span>
      </div>
    </TileShell>
  )
}
