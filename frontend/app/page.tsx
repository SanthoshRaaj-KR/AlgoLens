import { api } from '@/lib/api'
import type { Deployment } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="stat-card anim-fade-up">
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  let deployments: Deployment[] = []
  let error: string | null = null
  try { deployments = await api.listDeployments() } catch (e) { error = (e as Error).message }

  const uniqueEndpoints = new Set(deployments.map(d => d.Endpoint)).size
  const topClass = deployments.length
    ? Object.entries(deployments.reduce((acc, d) => { acc[d.Vector.ComplexityClass] = (acc[d.Vector.ComplexityClass] || 0) + 1; return acc }, {} as Record<string, number>))
        .sort(([,a],[,b]) => b - a)[0]?.[0] ?? '—'
    : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div className="anim-fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>Deployments</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Saved complexity fingerprints</p>
        </div>
        <Link href="/probe" className="btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Run Probe
        </Link>
      </div>

      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <StatCard label="Total Deployments" value={deployments.length} sub="fingerprints saved" icon="⊞" />
        <StatCard label="Unique Endpoints" value={uniqueEndpoints} sub="distinct URLs probed" icon="◎" />
        <StatCard label="Top Complexity" value={topClass} sub="most frequent class" icon="∿" />
      </div>

      {error && <div className="error-box anim-fade-in">{error}</div>}

      {!error && deployments.length === 0 && (
        <div className="card anim-fade-up">
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-title">No deployments yet</div>
            <div className="empty-sub">Run a probe to fingerprint an HTTP endpoint and save the result.</div>
            <Link href="/probe" className="btn-primary">Run your first probe →</Link>
          </div>
        </div>
      )}

      {deployments.length > 0 && (
        <div className="card anim-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="card-header">
            <span className="card-title">All Deployments</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>{deployments.length} total</span>
          </div>
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
                  <td style={{ color: 'var(--text-3)' }}>{d.ID}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={d.Endpoint}>{d.Endpoint}</td>
                  <td style={{ color: 'var(--text-2)' }}>{d.Version}</td>
                  <td><ComplexityBadge cls={d.Vector.ComplexityClass} /></td>
                  <td style={{ color: 'var(--text-2)' }}>{d.Vector.ComplexityExponent.toFixed(2)}</td>
                  <td style={{ color: d.Vector.ConcurrencyCliff === 0 ? 'var(--border-mid)' : '#fbbf24' }}>{d.Vector.ConcurrencyCliff === 0 ? '—' : d.Vector.ConcurrencyCliff}</td>
                  <td style={{ color: d.Vector.BreakingPoint === 0 ? 'var(--border-mid)' : '#f87171' }}>{d.Vector.BreakingPoint === 0 ? '—' : d.Vector.BreakingPoint}</td>
                  <td style={{ color: 'var(--text-3)' }}>{new Date(d.CreatedAt).toLocaleDateString()}</td>
                  <td><Link href={`/deployments/${d.ID}`} style={{ color: 'var(--accent-light)', textDecoration: 'none', fontSize: 12, transition: 'opacity 0.15s' }}>view →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
