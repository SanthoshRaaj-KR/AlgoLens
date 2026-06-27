'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { DiffResponse } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import { CurveChart } from '@/components/curve-chart'

function dir(d: string) {
  if (d === 'up')   return <span className="text-red-600 font-mono">↑</span>
  if (d === 'down') return <span className="text-green-600 font-mono">↓</span>
  return <span className="text-zinc-400 font-mono">=</span>
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
    <div className="space-y-6">
      <h1 className="text-base font-mono font-semibold text-zinc-900">Diff</h1>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-1">Deployment A (id)</label>
          <input
            value={a} onChange={e => setA(e.target.value)} type="number"
            className="w-28 border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-zinc-500 mb-1">Deployment B (id)</label>
          <input
            value={b} onChange={e => setB(e.target.value)} type="number"
            className="w-28 border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
            placeholder="2"
          />
        </div>
        <button
          onClick={run} disabled={loading || !a || !b}
          className="px-4 py-1.5 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Compare'}
        </button>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Header row */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            {[result.deployment_a, result.deployment_b].map((d, i) => (
              <div key={i} className="border border-zinc-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">{i === 0 ? 'A' : 'B'} · #{d.ID}</span>
                  <ComplexityBadge cls={d.Vector.ComplexityClass} />
                </div>
                <div className="text-zinc-800 truncate" title={d.Endpoint}>{d.Endpoint}</div>
                <div className="text-zinc-500">{d.Version} · {new Date(d.CreatedAt).toLocaleDateString()}</div>
                {d.Notes && <div className="text-zinc-400">{d.Notes}</div>}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
              <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Summary</span>
            </div>
            <ul className="px-4 py-3 space-y-1">
              {result.summary.map((s, i) => (
                <li key={i} className="text-xs font-mono text-zinc-700">{s}</li>
              ))}
            </ul>
          </div>

          {/* Delta table */}
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
              <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Field Deltas</span>
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50">
                  <th className="px-4 py-2 text-left text-zinc-500">Field</th>
                  <th className="px-4 py-2 text-right text-zinc-500">A</th>
                  <th className="px-4 py-2 text-right text-zinc-500">B</th>
                  <th className="px-4 py-2 text-right text-zinc-500">Delta</th>
                  <th className="px-4 py-2 text-center text-zinc-500"></th>
                </tr>
              </thead>
              <tbody>
                {result.deltas.map(d => (
                  <tr key={d.field} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-2 text-zinc-600">{FIELD_LABELS[d.field] ?? d.field}</td>
                    <td className="px-4 py-2 text-right text-zinc-800">{d.a.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right text-zinc-800">{d.b.toFixed(4)}</td>
                    <td className={`px-4 py-2 text-right ${d.direction === 'up' ? 'text-red-600' : d.direction === 'down' ? 'text-green-600' : 'text-zinc-400'}`}>
                      {d.delta > 0 ? '+' : ''}{d.delta.toFixed(4)}
                    </td>
                    <td className="px-4 py-2 text-center">{dir(d.direction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Curve overlay */}
          {(curveA.length > 0 || curveB.length > 0) && (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
                <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Curve Overlay</span>
              </div>
              <div className="p-4">
                <CurveChart series={[
                  ...(curveA.length > 0 ? [{ label: `A: ${result.deployment_a.Vector.ComplexityClass}`, color: '#3b82f6', curve: curveA }] : []),
                  ...(curveB.length > 0 ? [{ label: `B: ${result.deployment_b.Vector.ComplexityClass}`, color: '#ef4444', curve: curveB }] : []),
                ]} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
