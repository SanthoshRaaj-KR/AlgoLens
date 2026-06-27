import { Fragment } from 'react'
import type { ProbePoint } from '@/lib/types'

interface Props { points: ProbePoint[] }

const TH: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'center',
  color: '#475569',
  fontSize: 11,
  fontFamily: 'var(--font-geist-mono)',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'rgba(255,255,255,0.02)',
  borderBottom: '1px solid #1e293b',
}

const TD: React.CSSProperties = {
  padding: '9px 10px',
  textAlign: 'center',
  fontSize: 12,
  fontFamily: 'var(--font-geist-mono)',
  borderBottom: '1px solid #1e293b',
  color: '#94a3b8',
}

export function SweepTable({ points }: Props) {
  if (!points.length) return null

  const ns = [...new Set(points.map(p => p.N))].sort((a, b) => a - b)
  const cs = [...new Set(points.map(p => p.Concurrency))].sort((a, b) => a - b)

  const get = (n: number, c: number) => points.find(p => p.N === n && p.Concurrency === c)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-geist-mono)' }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left', borderRight: '1px solid #334155' }}>n</th>
            {cs.map(c => (
              <th key={c} colSpan={3} style={{ ...TH, borderRight: '1px solid #334155' }}>
                concurrency={c}
              </th>
            ))}
          </tr>
          <tr>
            <th style={{ ...TH, textAlign: 'left', borderRight: '1px solid #334155' }} />
            {cs.map(c => (
              <Fragment key={c}>
                <th style={TH}>p50</th>
                <th style={TH}>p95</th>
                <th style={{ ...TH, borderRight: '1px solid #334155' }}>p99</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {ns.map(n => (
            <tr
              key={n}
              style={{ transition: 'background 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
            >
              <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: '#e2e8f0', borderRight: '1px solid #334155' }}>
                {n}
              </td>
              {cs.map(c => {
                const pt = get(n, c)
                return pt ? (
                  <Fragment key={c}>
                    <td style={{ ...TD, color: '#f1f5f9' }}>{pt.P50.toFixed(1)}</td>
                    <td style={{ ...TD, color: '#94a3b8' }}>{pt.P95.toFixed(1)}</td>
                    <td style={{ ...TD, borderRight: '1px solid #334155', color: pt.Errors > 0 ? '#f87171' : '#64748b' }}>
                      {pt.P99.toFixed(1)}{pt.Errors > 0 ? ` (${pt.Errors}err)` : ''}
                    </td>
                  </Fragment>
                ) : (
                  <Fragment key={c}>
                    <td style={TD}>—</td>
                    <td style={TD}>—</td>
                    <td style={{ ...TD, borderRight: '1px solid #334155', color: '#334155' }}>—</td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: '#475569', marginTop: 8, fontFamily: 'var(--font-geist-mono)' }}>
        All latencies in milliseconds · Errors = non-2xx responses
      </p>
    </div>
  )
}
