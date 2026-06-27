import type { FingerprintVector } from '@/lib/types'
import { ComplexityBadge } from './complexity-badge'

interface Props { v: FingerprintVector }

const rows: { key: keyof FingerprintVector; label: string; fmt: (v: FingerprintVector[keyof FingerprintVector]) => string }[] = [
  { key: 'ComplexityExponent', label: 'Complexity Exponent', fmt: v => (v as number).toFixed(3) },
  { key: 'MemoryGrowthRate',   label: 'Memory Growth Rate',  fmt: v => (v as number).toFixed(4) },
  { key: 'ConcurrencyCliff',   label: 'Concurrency Cliff',   fmt: v => (v as number) === 0 ? 'not detected' : String(v) },
  { key: 'BreakingPoint',      label: 'Breaking Point (n)',  fmt: v => (v as number) === 0 ? 'not reached'  : String(v) },
  { key: 'ReadWriteRatio',     label: 'Read / Write Ratio',  fmt: v => (v as number).toFixed(2) },
]

export function FingerprintCard({ v }: Props) {
  return (
    <div className="card animate-fade-up">
      <div className="card-header">
        <span className="card-title">Fingerprint Vector</span>
        <ComplexityBadge cls={v.ComplexityClass} />
      </div>
      <div style={{ padding: '4px 16px' }}>
        {rows.map(({ key, label, fmt }) => (
          <div key={key} className="metric-row">
            <span className="metric-label">{label}</span>
            <span className="metric-value">{fmt(v[key])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
