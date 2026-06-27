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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-mono font-semibold text-zinc-900">{d.Endpoint}</h1>
            <ComplexityBadge cls={d.Vector.ComplexityClass} />
          </div>
          <div className="text-xs font-mono text-zinc-400">
            #{d.ID} · {d.Version} · {new Date(d.CreatedAt).toLocaleString()}
            {d.Notes && ` · ${d.Notes}`}
          </div>
        </div>
        <Link href="/" className="text-xs font-mono text-zinc-400 hover:text-zinc-700">← back</Link>
      </div>

      <FingerprintCard v={d.Vector} />

      {fittedCurve.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
            <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Fitted Curve</span>
          </div>
          <div className="p-4">
            <CurveChart series={[{ label: d.Vector.ComplexityClass, color: '#18181b', curve: fittedCurve }]} />
          </div>
        </div>
      )}

      {sweepPoints.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
            <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Latency Matrix</span>
          </div>
          <div className="p-4">
            <SweepTable points={sweepPoints} />
          </div>
        </div>
      )}

      <details className="border border-zinc-200 rounded-lg overflow-hidden">
        <summary className="bg-zinc-50 px-4 py-2 border-b border-zinc-200 text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide cursor-pointer hover:bg-zinc-100">
          Raw JSON blobs
        </summary>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-mono text-zinc-400 mb-1">fitted_curve</p>
            <pre className="text-xs font-mono text-zinc-600 bg-zinc-50 p-3 rounded overflow-x-auto max-h-40">{d.FittedCurveJSON || '—'}</pre>
          </div>
          <div>
            <p className="text-xs font-mono text-zinc-400 mb-1">sweep_result</p>
            <pre className="text-xs font-mono text-zinc-600 bg-zinc-50 p-3 rounded overflow-x-auto max-h-40">{d.SweepResultJSON || '—'}</pre>
          </div>
        </div>
      </details>
    </div>
  )
}
