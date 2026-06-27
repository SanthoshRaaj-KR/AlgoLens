import { Fragment } from 'react'
import type { ProbePoint } from '@/lib/types'

interface Props { points: ProbePoint[] }

export function SweepTable({ points }: Props) {
  if (!points.length) return null
  const ns = [...new Set(points.map(p => p.N))].sort((a, b) => a - b)
  const cs = [...new Set(points.map(p => p.Concurrency))].sort((a, b) => a - b)
  const get = (n: number, c: number) => points.find(p => p.N === n && p.Concurrency === c)

  const TH: React.CSSProperties = { padding: '10px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', fontFamily: 'var(--font-geist-mono)', whiteSpace: 'nowrap' as const }
  const TD: React.CSSProperties = { padding: '10px 12px', textAlign: 'center' as const, fontSize: 12, fontFamily: 'var(--font-geist-mono)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left', borderRight: '1px solid var(--border-mid)', minWidth: 48 }}>n</th>
            {cs.map(c => <th key={c} colSpan={3} style={{ ...TH, borderRight: '1px solid var(--border-mid)' }}>concurrency={c}</th>)}
          </tr>
          <tr>
            <th style={{ ...TH, textAlign: 'left', borderRight: '1px solid var(--border-mid)' }} />
            {cs.map(c => (
              <Fragment key={c}>
                <th style={TH}>p50</th>
                <th style={TH}>p95</th>
                <th style={{ ...TH, borderRight: '1px solid var(--border-mid)' }}>p99</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {ns.map(n => (
            <tr key={n} style={{ transition: 'background 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
              <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: 'var(--text)', borderRight: '1px solid var(--border-mid)' }}>{n}</td>
              {cs.map(c => {
                const pt = get(n, c)
                return pt ? (
                  <Fragment key={c}>
                    <td style={{ ...TD, color: 'var(--text)' }}>{pt.P50.toFixed(1)}</td>
                    <td style={TD}>{pt.P95.toFixed(1)}</td>
                    <td style={{ ...TD, color: pt.Errors > 0 ? '#f87171' : 'var(--text-3)', borderRight: '1px solid var(--border-mid)' }}>{pt.P99.toFixed(1)}{pt.Errors > 0 ? ` (${pt.Errors}err)` : ''}</td>
                  </Fragment>
                ) : (
                  <Fragment key={c}>
                    <td style={{ ...TD, color: 'var(--border-mid)' }}>—</td>
                    <td style={{ ...TD, color: 'var(--border-mid)' }}>—</td>
                    <td style={{ ...TD, color: 'var(--border-mid)', borderRight: '1px solid var(--border-mid)' }}>—</td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10, fontFamily: 'var(--font-geist-mono)' }}>All latencies in milliseconds · Errors = non-2xx responses</p>
    </div>
  )
}
