import type { ProbePoint } from '@/lib/types'

interface Props { points: ProbePoint[] }

export function SweepTable({ points }: Props) {
  if (!points.length) return null

  const ns = [...new Set(points.map(p => p.N))].sort((a, b) => a - b)
  const cs = [...new Set(points.map(p => p.Concurrency))].sort((a, b) => a - b)

  const get = (n: number, c: number) => points.find(p => p.N === n && p.Concurrency === c)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border border-zinc-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-zinc-50">
            <th className="px-3 py-2 text-left text-zinc-500 border-b border-r border-zinc-200">n</th>
            {cs.map(c => (
              <th key={c} colSpan={3} className="px-3 py-2 text-center text-zinc-500 border-b border-r border-zinc-200">
                concurrency={c}
              </th>
            ))}
          </tr>
          <tr className="bg-zinc-50">
            <th className="px-3 py-2 border-b border-r border-zinc-200 text-zinc-400"></th>
            {cs.map(c => (
              <>
                <th key={`${c}-p50`} className="px-3 py-2 text-center text-zinc-400 border-b border-zinc-200">p50</th>
                <th key={`${c}-p95`} className="px-3 py-2 text-center text-zinc-400 border-b border-zinc-200">p95</th>
                <th key={`${c}-p99`} className="px-3 py-2 text-center text-zinc-400 border-b border-r border-zinc-200">p99</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {ns.map((n, i) => (
            <tr key={n} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
              <td className="px-3 py-2 font-semibold text-zinc-700 border-r border-zinc-200">{n}</td>
              {cs.map(c => {
                const pt = get(n, c)
                return pt ? (
                  <>
                    <td key={`${c}-p50`} className="px-3 py-2 text-center text-zinc-800">{pt.P50.toFixed(1)}</td>
                    <td key={`${c}-p95`} className="px-3 py-2 text-center text-zinc-600">{pt.P95.toFixed(1)}</td>
                    <td key={`${c}-p99`} className={`px-3 py-2 text-center border-r border-zinc-200 ${pt.Errors > 0 ? 'text-red-600' : 'text-zinc-500'}`}>
                      {pt.P99.toFixed(1)}{pt.Errors > 0 ? ` (${pt.Errors}err)` : ''}
                    </td>
                  </>
                ) : (
                  <>
                    <td key={`${c}-p50`} className="px-3 py-2 text-center text-zinc-300">—</td>
                    <td key={`${c}-p95`} className="px-3 py-2 text-center text-zinc-300">—</td>
                    <td key={`${c}-p99`} className="px-3 py-2 text-center text-zinc-300 border-r border-zinc-200">—</td>
                  </>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-400 mt-1">All latencies in milliseconds. Errors = non-2xx count.</p>
    </div>
  )
}
