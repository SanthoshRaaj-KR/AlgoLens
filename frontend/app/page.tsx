import { api } from '@/lib/api'
import type { Deployment } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let deployments: Deployment[] = []
  let error: string | null = null

  try {
    deployments = await api.listDeployments()
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0 }}>
            Deployments
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontFamily: 'var(--font-geist-mono)' }}>
            {deployments.length > 0
              ? `${deployments.length} saved fingerprint${deployments.length !== 1 ? 's' : ''}`
              : 'No fingerprints saved yet'}
          </p>
        </div>
        <Link href="/probe" className="btn-primary">
          + Run Probe
        </Link>
      </div>

      {error && <div className="error-box">{error}</div>}

      {!error && deployments.length === 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="empty-state">
            <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
            <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 14 }}>No deployments saved yet</p>
            <p style={{ margin: '0 0 20px', color: '#334155', fontSize: 13 }}>
              Run a probe against an HTTP endpoint and save the fingerprint.
            </p>
            <Link href="/probe" className="btn-primary">
              Run your first probe →
            </Link>
          </div>
        </div>
      )}

      {deployments.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '60ms' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Endpoint</th>
                <th>Version</th>
                <th>Complexity</th>
                <th>Exponent</th>
                <th>Cliff</th>
                <th>Breaking</th>
                <th>Saved</th>
                <th style={{ width: 64 }} />
              </tr>
            </thead>
            <tbody>
              {deployments.map(d => (
                <tr key={d.ID}>
                  <td style={{ color: '#475569' }}>{d.ID}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }} title={d.Endpoint}>
                    {d.Endpoint}
                  </td>
                  <td style={{ color: '#94a3b8' }}>{d.Version}</td>
                  <td><ComplexityBadge cls={d.Vector.ComplexityClass} /></td>
                  <td style={{ color: '#94a3b8' }}>{d.Vector.ComplexityExponent.toFixed(2)}</td>
                  <td style={{ color: d.Vector.ConcurrencyCliff === 0 ? '#334155' : '#fbbf24' }}>
                    {d.Vector.ConcurrencyCliff === 0 ? '—' : d.Vector.ConcurrencyCliff}
                  </td>
                  <td style={{ color: d.Vector.BreakingPoint === 0 ? '#334155' : '#f87171' }}>
                    {d.Vector.BreakingPoint === 0 ? '—' : d.Vector.BreakingPoint}
                  </td>
                  <td style={{ color: '#475569' }}>{new Date(d.CreatedAt).toLocaleDateString()}</td>
                  <td>
                    <Link
                      href={`/deployments/${d.ID}`}
                      style={{ color: '#6366f1', textDecoration: 'none', fontSize: 12, transition: 'color 0.15s' }}
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
