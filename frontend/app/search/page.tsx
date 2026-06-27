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

function scoreStyle(score: number): React.CSSProperties {
  if (score >= 0.9) return { color: '#f87171', fontWeight: 700 }
  if (score >= 0.7) return { color: '#fbbf24', fontWeight: 700 }
  return { color: '#34d399', fontWeight: 700 }
}

const FIELDS: { key: keyof FingerprintVector; label: string; type: string }[] = [
  { key: 'ComplexityClass',    label: 'Complexity Class',    type: 'text' },
  { key: 'ComplexityExponent', label: 'Complexity Exponent', type: 'number' },
  { key: 'MemoryGrowthRate',   label: 'Memory Growth Rate',  type: 'number' },
  { key: 'ConcurrencyCliff',   label: 'Concurrency Cliff',   type: 'number' },
  { key: 'BreakingPoint',      label: 'Breaking Point',      type: 'number' },
  { key: 'ReadWriteRatio',     label: 'Read / Write Ratio',  type: 'number' },
]

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
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0 }}>
          Similarity Search
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontFamily: 'var(--font-geist-mono)' }}>
          Find saved deployments with similar fingerprint vectors using cosine similarity
        </p>
      </div>

      {/* Vector input */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Query Vector</span>
        </div>
        <div
          className="card-body"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}
        >
          {FIELDS.map(({ key, label, type }) => (
            <div key={key}>
              <label className="input-label">{label}</label>
              <input
                type={type}
                step="any"
                value={String(vec[key])}
                onChange={setField(key)}
                className="input"
              />
            </div>
          ))}
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button onClick={run} disabled={loading} className="btn-primary">
            {loading ? <><span className="spinner" /> Searching…</> : 'Search'}
          </button>
        </div>
      </div>

      {error && <div className="error-box animate-fade-in">{error}</div>}

      {results && results.length === 0 && (
        <div className="card animate-fade-up">
          <div className="empty-state">
            <p style={{ margin: '0 0 6px' }}>No deployments saved yet</p>
            <p style={{ margin: 0, color: '#334155', fontSize: 12 }}>Save a probe result first, then search for similar ones.</p>
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="card animate-fade-up">
          <table className="data-table">
            <thead>
              <tr>
                <th>Score</th>
                <th style={{ width: 48 }}>#</th>
                <th>Endpoint</th>
                <th>Version</th>
                <th>Complexity</th>
                <th>Exponent</th>
                <th>Date</th>
                <th style={{ width: 64 }} />
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.ID}
                  style={{
                    background: i === 0 ? 'rgba(99,102,241,0.06)' : undefined,
                  }}
                >
                  <td style={scoreStyle(r.Score)}>{(r.Score * 100).toFixed(1)}%</td>
                  <td style={{ color: '#475569' }}>{r.ID}</td>
                  <td
                    style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}
                    title={r.Endpoint}
                  >
                    {r.Endpoint}
                  </td>
                  <td style={{ color: '#94a3b8' }}>{r.Version}</td>
                  <td><ComplexityBadge cls={r.Vector.ComplexityClass} /></td>
                  <td style={{ color: '#94a3b8' }}>{r.Vector.ComplexityExponent.toFixed(3)}</td>
                  <td style={{ color: '#475569' }}>{new Date(r.CreatedAt).toLocaleDateString()}</td>
                  <td>
                    <Link
                      href={`/deployments/${r.ID}`}
                      style={{ color: '#6366f1', textDecoration: 'none', fontSize: 12 }}
                    >
                      view →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
