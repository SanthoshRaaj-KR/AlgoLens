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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-mono font-semibold text-zinc-900">Deployments</h1>
        <Link
          href="/probe"
          className="px-3 py-1.5 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700"
        >
          + Run Probe
        </Link>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {!error && deployments.length === 0 && (
        <div className="text-xs font-mono text-zinc-400 py-8 text-center">
          No deployments yet. Run a probe and save it.
        </div>
      )}

      {deployments.length > 0 && (
        <table className="w-full text-xs font-mono border border-zinc-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-4 py-2 text-left text-zinc-500">ID</th>
              <th className="px-4 py-2 text-left text-zinc-500">Endpoint</th>
              <th className="px-4 py-2 text-left text-zinc-500">Version</th>
              <th className="px-4 py-2 text-left text-zinc-500">Complexity</th>
              <th className="px-4 py-2 text-left text-zinc-500">Exponent</th>
              <th className="px-4 py-2 text-left text-zinc-500">Cliff</th>
              <th className="px-4 py-2 text-left text-zinc-500">Breaking</th>
              <th className="px-4 py-2 text-left text-zinc-500">Saved</th>
              <th className="px-4 py-2 text-left text-zinc-500"></th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((d, i) => (
              <tr key={d.ID} className={`border-b border-zinc-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}`}>
                <td className="px-4 py-2 text-zinc-400">{d.ID}</td>
                <td className="px-4 py-2 text-zinc-800 max-w-xs truncate" title={d.Endpoint}>{d.Endpoint}</td>
                <td className="px-4 py-2 text-zinc-700">{d.Version}</td>
                <td className="px-4 py-2"><ComplexityBadge cls={d.Vector.ComplexityClass} /></td>
                <td className="px-4 py-2 text-zinc-600">{d.Vector.ComplexityExponent.toFixed(2)}</td>
                <td className="px-4 py-2 text-zinc-600">{d.Vector.ConcurrencyCliff === 0 ? '—' : d.Vector.ConcurrencyCliff}</td>
                <td className="px-4 py-2 text-zinc-600">{d.Vector.BreakingPoint === 0 ? '—' : d.Vector.BreakingPoint}</td>
                <td className="px-4 py-2 text-zinc-400">{new Date(d.CreatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <Link href={`/deployments/${d.ID}`} className="text-zinc-400 hover:text-zinc-700">view →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
