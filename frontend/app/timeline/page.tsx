'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { Deployment } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import { DriftChart } from '@/components/drift-chart'

export default function TimelinePage() {
  const [endpoint, setEndpoint] = useState('')
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<Deployment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!endpoint.trim()) return
    setLoading(true)
    setError(null)
    try {
      setList(await api.timeline(endpoint.trim()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-base font-mono font-semibold text-zinc-900">Timeline</h1>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-mono text-zinc-500 mb-1">Endpoint URL</label>
          <input
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
            placeholder="http://api.example.com/search"
          />
        </div>
        <button
          onClick={run} disabled={loading || !endpoint.trim()}
          className="px-4 py-1.5 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded">{error}</div>
      )}

      {list && list.length === 0 && (
        <div className="text-xs font-mono text-zinc-400 py-8 text-center">No deployments found for this endpoint.</div>
      )}

      {list && list.length > 0 && (
        <div className="space-y-6">
          {/* Drift chart */}
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
              <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Drift Over Time</span>
            </div>
            <div className="p-4">
              <DriftChart deployments={list} />
            </div>
          </div>

          {/* Chronological table */}
          <table className="w-full text-xs font-mono border border-zinc-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="px-4 py-2 text-left text-zinc-500">Date</th>
                <th className="px-4 py-2 text-left text-zinc-500">Version</th>
                <th className="px-4 py-2 text-left text-zinc-500">Complexity</th>
                <th className="px-4 py-2 text-left text-zinc-500">Exponent</th>
                <th className="px-4 py-2 text-left text-zinc-500">Mem Growth</th>
                <th className="px-4 py-2 text-left text-zinc-500">Cliff</th>
                <th className="px-4 py-2 text-left text-zinc-500">Breaking</th>
                <th className="px-4 py-2 text-left text-zinc-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d, i) => (
                <tr key={d.ID} className={`border-b border-zinc-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}`}>
                  <td className="px-4 py-2 text-zinc-400">{new Date(d.CreatedAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-zinc-700">{d.Version}</td>
                  <td className="px-4 py-2"><ComplexityBadge cls={d.Vector.ComplexityClass} /></td>
                  <td className="px-4 py-2 text-zinc-600">{d.Vector.ComplexityExponent.toFixed(3)}</td>
                  <td className="px-4 py-2 text-zinc-600">{d.Vector.MemoryGrowthRate.toFixed(4)}</td>
                  <td className="px-4 py-2 text-zinc-600">{d.Vector.ConcurrencyCliff === 0 ? '—' : d.Vector.ConcurrencyCliff}</td>
                  <td className="px-4 py-2 text-zinc-600">{d.Vector.BreakingPoint === 0 ? '—' : d.Vector.BreakingPoint}</td>
                  <td className="px-4 py-2 text-zinc-400">{d.Notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
