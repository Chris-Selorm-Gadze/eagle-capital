import type { ReactNode } from 'react'

export function TileShell({
  label,
  info,
  badge,
  children,
}: {
  label: string
  info?: string
  badge?: string | number
  children: ReactNode
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1.1rem', minWidth: 170, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {label}
          {info && (
            <span
              title={info}
              style={{
                cursor: 'help', color: 'var(--text-muted)', fontSize: '0.65rem', lineHeight: 1,
                border: '1px solid var(--text-muted)', borderRadius: '50%', width: 13, height: 13,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              i
            </span>
          )}
        </div>
        {badge !== undefined && (
          <span style={{
            fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface-3)',
            padding: '0.1rem 0.45rem', borderRadius: 10,
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
