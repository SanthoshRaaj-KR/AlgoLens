'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { DiffResponse } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import { CurveChart } from '@/components/curve-chart'

function DirIcon({ d }: { d: string }) {
  if (d === 'up')   return <span style={{ color: '#f87171', fontWeight: 600 }}>↑</span>
  if (d === 'down') return <span style={{ color: '#34d399', fontWeight: 600 }}>↓</span>
  return <span style={{ color: '#475569' }}>=</span>
}

const FIELD_LABELS: Record<string, string> = {
  complexity_exponent: 'Complexity Exponent',
  memory_growth_rate:  'Memory Growth Rate',
  concurrency_cliff:   'Concurrency Cliff',
  breaking_point:      'Breaking Point (n)',
  read_write_ratio:    'Read/Write Ratio',
}

export default function DiffPage() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!a || !b) return
    setLoading(true)
    setError(null)
    try {
      setResult(await api.diff(Number(a), Number(b)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const curveA: [number, number][] = result ? (() => {
    try { return JSON.parse(result.deployment_a.FittedCurveJSON) } catch { return [] }
  })() : []
  const curveB: [number, number][] = result ? (() => {
    try { return JSON.parse(result.deployment_b.FittedCurveJSON) } catch { return [] }
  })() : []

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0 }}>
          Diff
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontFamily: 'var(--font-geist-mono)' }}>
          Compare two saved deployments by ID
        </p>
      </div>

      {/* Input row */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div>
            <label className="input-label">Deployment A (id)</label>
            <input
              value={a}
              onChange={e => setA(e.target.value)}
              type="number"
              className="input"
              style={{ width: 120 }}
              placeholder="1"
              onKeyDown={e => e.key === 'Enter' && run()}
            />
          </div>
          <div style={{ color: '#334155', fontSize: 20, paddingBottom: 6 }}>vs</div>
          <div>
            <label className="input-label">Deployment B (id)</label>
            <input
              value={b}
              onChange={e => setB(e.target.value)}
              type="number"
              className="input"
              style={{ width: 120 }}
              placeholder="2"
              onKeyDown={e => e.key === 'Enter' && run()}
            />
          </div>
          <button onClick={run} disabled={loading || !a || !b} className="btn-primary">
            {loading ? <><span className="spinner" /> Comparing…</> : 'Compare'}
          </button>
        </div>
      </div>

      {error && <div className="error-box animate-fade-in">{error}</div>}

      {result && (
        <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Deployment cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[result.deployment_a, result.deployment_b].map((d, i) => (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: i === 0 ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)',
                      color: i === 0 ? '#818cf8' : '#f87171',
                      fontFamily: 'var(--font-geist-mono)',
                    }}
                  >
                    {i === 0 ? 'A' : 'B'}
                  </span>
                  <span style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-geist-mono)' }}>#{d.ID}</span>
                  <ComplexityBadge cls={d.Vector.ComplexityClass} />
                </div>
                <p
                  style={{ fontSize: 13, color: '#e2e8f0', margin: '0 0 4px', fontFamily: 'var(--font-geist-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={d.Endpoint}
                >
                  {d.Endpoint}
                </p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0, fontFamily: 'var(--font-geist-mono)' }}>
                  {d.Version} · {new Date(d.CreatedAt).toLocaleDateString()}
                  {d.Notes && ` · ${d.Notes}`}
                </p>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Summary</span>
            </div>
            <ul style={{ margin: 0, padding: '8px 16px 12px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.summary.map((s, i) => (
                <li key={i} style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'var(--font-geist-mono)', paddingLeft: 12, borderLeft: '2px solid #334155' }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Delta table */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Field Deltas</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th style={{ textAlign: 'right' }}>A</th>
                  <th style={{ textAlign: 'right' }}>B</th>
                  <th style={{ textAlign: 'right' }}>Delta</th>
                  <th style={{ textAlign: 'center', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {result.deltas.map(d => (
                  <tr key={d.field}>
                    <td style={{ color: '#94a3b8' }}>{FIELD_LABELS[d.field] ?? d.field}</td>
                    <td style={{ textAlign: 'right', color: '#e2e8f0' }}>{d.a.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', color: '#e2e8f0' }}>{d.b.toFixed(4)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color: d.direction === 'up' ? '#f87171' : d.direction === 'down' ? '#34d399' : '#475569',
                      }}
                    >
                      {d.delta > 0 ? '+' : ''}{d.delta.toFixed(4)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <DirIcon d={d.direction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Curve overlay */}
          {(curveA.length > 0 || curveB.length > 0) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Curve Overlay</span>
              </div>
              <div className="card-body">
                <CurveChart series={[
                  ...(curveA.length > 0 ? [{ label: `A: ${result.deployment_a.Vector.ComplexityClass}`, color: '#818cf8', curve: curveA }] : []),
                  ...(curveB.length > 0 ? [{ label: `B: ${result.deployment_b.Vector.ComplexityClass}`, color: '#f87171', curve: curveB }] : []),
                ]} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
