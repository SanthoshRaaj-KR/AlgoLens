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
  try { d = await api.getDeployment(Number(id)) } catch { notFound() }

  let sweepPoints: ProbePoint[] = []
  let fittedCurve: [number, number][] = []
  try { sweepPoints = JSON.parse(d.SweepResultJSON) } catch {}
  try { fittedCurve = JSON.parse(d.FittedCurveJSON) } catch {}

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em', fontFamily: 'var(--font-geist-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }} title={d.Endpoint}>{d.Endpoint}</h1>
            <ComplexityBadge cls={d.Vector.ComplexityClass} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, fontFamily: 'var(--font-geist-mono)', color: 'var(--text-3)' }}>
            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>#{d.ID}</span>
            <span style={{ color: 'var(--accent-light)' }}>{d.Version}</span>
            <span>{new Date(d.CreatedAt).toLocaleString()}</span>
            {d.Notes && <span style={{ fontStyle: 'italic' }}>{d.Notes}</span>}
          </div>
        </div>
        <Link href="/" className="btn-ghost" style={{ flexShrink: 0 }}>← Back</Link>
      </div>

      <FingerprintCard v={d.Vector} />

      {fittedCurve.length > 0 && (
        <div className="card anim-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="card-header"><span className="card-title">Fitted Curve</span></div>
          <div className="card-body"><CurveChart series={[{ label: d.Vector.ComplexityClass, color: '#a78bfa', curve: fittedCurve }]} /></div>
        </div>
      )}

      {sweepPoints.length > 0 && (
        <div className="card anim-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="card-header"><span className="card-title">Latency Matrix</span></div>
          <div className="card-body"><SweepTable points={sweepPoints} /></div>
        </div>
      )}

      <details className="card anim-fade-up" style={{ animationDelay: '140ms', overflow: 'visible' }}>
        <summary style={{ padding: '14px 20px', cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)', userSelect: 'none' }}>Raw JSON</summary>
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['fitted_curve', d.FittedCurveJSON] as const) && null}
          {[['fitted_curve', d.FittedCurveJSON], ['sweep_result', d.SweepResultJSON]].map(([label, json]) => (
            <div key={label}>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 8px', fontFamily: 'var(--font-geist-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</p>
              <pre className="code-block">{json || '—'}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
