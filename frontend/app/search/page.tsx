'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { SimilarityResult, FingerprintVector } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import Link from 'next/link'

const EMPTY_VECTOR: FingerprintVector = {
  ComplexityClass: 'O(n)',
  ComplexityExponent: 1.0,
  MemoryGrowthRate: 0,
  ConcurrencyCliff: 0,
  BreakingPoint: 0,
  ReadWriteRatio: 0.5,
}

function scoreColor(score: number) {
  if (score >= 0.9) return 'text-red-600'
  if (score >= 0.7) return 'text-yellow-600'
  return 'text-green-600'
}

export default function SearchPage() {
  const [vec, setVec] = useState<FingerprintVector>(EMPTY_VECTOR)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SimilarityResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setField(k: keyof FingerprintVector) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = k === 'ComplexityClass' ? e.target.value : parseFloat(e.target.value)
      setVec(prev => ({ ...prev, [k]: val }))
    }
  }

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResults(await api.search(vec))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-base font-mono font-semibold text-zinc-900">Similarity Search</h1>
      <p className="text-xs font-mono text-zinc-400">Enter a fingerprint vector to find the most similar saved deployments (cosine similarity).</p>

      {/* Vector input */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
          <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Query Vector</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { key: 'ComplexityClass',    label: 'Complexity Class',    type: 'text' },
            { key: 'ComplexityExponent', label: 'Complexity Exponent', type: 'number' },
            { key: 'MemoryGrowthRate',   label: 'Memory Growth Rate',  type: 'number' },
            { key: 'ConcurrencyCliff',   label: 'Concurrency Cliff',   type: 'number' },
            { key: 'BreakingPoint',      label: 'Breaking Point',      type: 'number' },
            { key: 'ReadWriteRatio',     label: 'Read/Write Ratio',    type: 'number' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs font-mono text-zinc-500 mb-1">{label}</label>
              <input
                type={type}
                step="any"
                value={String(vec[key as keyof FingerprintVector])}
                onChange={setField(key as keyof FingerprintVector)}
                className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
              />
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={run} disabled={loading}
            className="px-4 py-2 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded">{error}</div>
      )}

      {results && results.length === 0 && (
        <div className="text-xs font-mono text-zinc-400 py-8 text-center">No deployments in database to compare against.</div>
      )}

      {results && results.length > 0 && (
        <table className="w-full text-xs font-mono border border-zinc-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-4 py-2 text-left text-zinc-500">Score</th>
              <th className="px-4 py-2 text-left text-zinc-500">ID</th>
              <th className="px-4 py-2 text-left text-zinc-500">Endpoint</th>
              <th className="px-4 py-2 text-left text-zinc-500">Version</th>
              <th className="px-4 py-2 text-left text-zinc-500">Complexity</th>
              <th className="px-4 py-2 text-left text-zinc-500">Exponent</th>
              <th className="px-4 py-2 text-left text-zinc-500">Date</th>
              <th className="px-4 py-2 text-left text-zinc-500"></th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.ID} className={`border-b border-zinc-100 last:border-0 ${i === 0 ? 'bg-yellow-50' : i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}`}>
                <td className={`px-4 py-2 font-semibold ${scoreColor(r.Score)}`}>{(r.Score * 100).toFixed(1)}%</td>
                <td className="px-4 py-2 text-zinc-400">{r.ID}</td>
                <td className="px-4 py-2 text-zinc-700 max-w-xs truncate" title={r.Endpoint}>{r.Endpoint}</td>
                <td className="px-4 py-2 text-zinc-700">{r.Version}</td>
                <td className="px-4 py-2"><ComplexityBadge cls={r.Vector.ComplexityClass} /></td>
                <td className="px-4 py-2 text-zinc-600">{r.Vector.ComplexityExponent.toFixed(3)}</td>
                <td className="px-4 py-2 text-zinc-400">{new Date(r.CreatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <Link href={`/deployments/${r.ID}`} className="text-zinc-400 hover:text-zinc-700">view →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
