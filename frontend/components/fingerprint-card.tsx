import type { FingerprintVector } from '@/lib/types'
import { ComplexityBadge } from './complexity-badge'

interface Props { v: FingerprintVector }

const rows: { key: keyof FingerprintVector; label: string; fmt?: (v: number) => string }[] = [
  { key: 'ComplexityExponent', label: 'Complexity Exponent', fmt: v => v.toFixed(3) },
  { key: 'MemoryGrowthRate',   label: 'Memory Growth Rate', fmt: v => v.toFixed(4) },
  { key: 'ConcurrencyCliff',   label: 'Concurrency Cliff',  fmt: v => v === 0 ? 'not detected' : String(v) },
  { key: 'BreakingPoint',      label: 'Breaking Point (n)', fmt: v => v === 0 ? 'not reached'  : String(v) },
  { key: 'ReadWriteRatio',     label: 'Read/Write Ratio',   fmt: v => v.toFixed(2) },
]

export function FingerprintCard({ v }: Props) {
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Fingerprint Vector</span>
        <ComplexityBadge cls={v.ComplexityClass} />
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(({ key, label, fmt }) => (
            <tr key={key} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-2 text-zinc-500 font-mono text-xs">{label}</td>
              <td className="px-4 py-2 text-zinc-900 font-mono text-xs text-right">
                {fmt ? fmt(v[key] as number) : String(v[key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
