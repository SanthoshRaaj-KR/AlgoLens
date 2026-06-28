import type { FingerprintVector } from '@/lib/types'
import { ComplexityBadge } from './complexity-badge'

interface Props { v: FingerprintVector }

const ROWS: { key: keyof FingerprintVector; label: string; fmt: (v: FingerprintVector[keyof FingerprintVector]) => string }[] = [
  { key: 'ComplexityExponent', label: 'Complexity Exponent', fmt: v => (v as number).toFixed(3) },
  { key: 'MemoryGrowthRate',   label: 'Memory Growth Rate',  fmt: v => (v as number).toFixed(4) },
  { key: 'ConcurrencyCliff',   label: 'Concurrency Cliff',   fmt: v => (v as number) === 0 ? 'not detected' : String(v) },
  { key: 'BreakingPoint',      label: 'Breaking Point (n)',  fmt: v => (v as number) === 0 ? 'not reached'  : String(v) },
  { key: 'ReadWriteRatio',   label: 'Read / Write Ratio',  fmt: v => (v as number).toFixed(2) },
]

const ACTUAL_KEYS: (keyof FingerprintVector)[] = [
  'ComplexityExponent','MemoryGrowthRate','ConcurrencyCliff','BreakingPoint','ReadWriteRatio'
]
const LABELS = ['Complexity Exponent','Memory Growth Rate','Concurrency Cliff','Breaking Point (n)','Read / Write Ratio']
const FMTS = [
  (v: number) => v.toFixed(3),
  (v: number) => v.toFixed(4),
  (v: number) => v === 0 ? 'not detected' : String(v),
  (v: number) => v === 0 ? 'not reached' : String(v),
  (v: number) => v.toFixed(2),
]

export function FingerprintCard({ v }: Props) {
  return (
    <div className="card anim-fade-up">
      <div className="card-header">
        <span className="card-title">Fingerprint Vector</span>
        <ComplexityBadge cls={v.ComplexityClass} />
      </div>
      <div style={{ padding: '4px 20px' }}>
        {ACTUAL_KEYS.map((key, i) => (
          <div key={key} className="metric-row">
            <span className="metric-label">{LABELS[i]}</span>
            <span className="metric-value">{FMTS[i](v[key] as number)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
