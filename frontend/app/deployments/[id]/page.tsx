import { api } from '@/lib/api'
import { FingerprintCard } from '@/components/fingerprint-card'
import { ComplexityBadge } from '@/components/complexity-badge'
import { SweepTable } from '@/components/sweep-table'
import { CurveChart } from '@/components/curve-chart'
import type { ProbePoint } from '@/lib/types'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let d
  try {
    d = await api.getDeployment(Number(id))
  } catch {
    notFound()
  }

  let sweepPoints: ProbePoint[] = []
  let fittedCurve: [number, number][] = []
  try { sweepPoints = JSON.parse(d.SweepResultJSON) } catch {}
  try { fittedCurve = JSON.parse(d.FittedCurveJSON) } catch {}

  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#f1f5f9',
                margin: 0,
                letterSpacing: '-0.01em',
                fontFamily: 'var(--font-geist-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 560,
              }}
              title={d.Endpoint}
            >
              {d.Endpoint}
            </h1>
            <ComplexityBadge cls={d.Vector.ComplexityClass} />
          </div>
          <div style={{ fontSize: 12, color: '#475569', fontFamily: 'var(--font-geist-mono)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b' }}>#{d.ID}</span>
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>{d.Version}</span>
            <span>{new Date(d.CreatedAt).toLocaleString()}</span>
            {d.Notes && <span style={{ color: '#64748b', fontStyle: 'italic' }}>{d.Notes}</span>}
          </div>
        </div>
        <Link
          href="/"
          className="btn-ghost"
          style={{ flexShrink: 0, fontSize: 13 }}
        >
          ← Back
        </Link>
      </div>

      {/* Fingerprint */}
      <FingerprintCard v={d.Vector} />

      {/* Fitted curve */}
      {fittedCurve.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="card-header">
            <span className="card-title">Fitted Curve</span>
          </div>
          <div className="card-body">
            <CurveChart series={[{ label: d.Vector.ComplexityClass, color: '#818cf8', curve: fittedCurve }]} />
          </div>
        </div>
      )}

      {/* Latency matrix */}
      {sweepPoints.length > 0 && (
        <div className="card animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="card-header">
            <span className="card-title">Latency Matrix</span>
          </div>
          <div className="card-body">
            <SweepTable points={sweepPoints} />
          </div>
        </div>
      )}

      {/* Raw JSON */}
      <details
        className="card animate-fade-up"
        style={{ animationDelay: '140ms', overflow: 'visible' }}
      >
        <summary
          style={{
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#475569',
            fontFamily: 'var(--font-geist-mono)',
            userSelect: 'none',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Raw JSON
        </summary>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[['fitted_curve', d.FittedCurveJSON], ['sweep_result', d.SweepResultJSON]].map(([label, json]) => (
            <div key={label}>
              <p style={{ fontSize: 11, color: '#475569', margin: '0 0 6px', fontFamily: 'var(--font-geist-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </p>
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono)',
                  color: '#64748b',
                  background: '#020617',
                  padding: 12,
                  borderRadius: 8,
                  overflowX: 'auto',
                  maxHeight: 160,
                  margin: 0,
                  border: '1px solid #1e293b',
                  lineHeight: 1.5,
                }}
              >
                {json || '—'}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
