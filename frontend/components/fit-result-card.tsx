import type { FitResult } from '@/lib/types'
import { ComplexityBadge } from './complexity-badge'

interface Props { fit: FitResult }

export function FitResultCard({ fit }: Props) {
  const rows = [
    ['Complexity Class', fit.complexity_class],
    ['Exponent',         fit.exponent.toFixed(4)],
    ['Coefficient',      fit.coefficient.toFixed(6)],
    ['R² Score',         fit.r_squared.toFixed(6)],
    ['Curve Points',     String(fit.fitted_curve?.length ?? 0)],
  ] as const

  return (
    <div className="card anim-fade-up" style={{ animationDelay: '60ms' }}>
      <div className="card-header">
        <span className="card-title">Curve Fit</span>
        <ComplexityBadge cls={fit.complexity_class} />
      </div>
      <div style={{ padding: '4px 20px' }}>
        {rows.map(([label, value]) => (
          <div key={label} className="metric-row">
            <span className="metric-label">{label}</span>
            <span className="metric-value">{value}</span>
          </div>
        ))}
      </div>
      {fit.fitted_curve && fit.fitted_curve.length > 0 && (
        <details style={{ borderTop: '1px solid var(--border)' }}>
          <summary style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-geist-mono)' }}>
            Raw curve data ({fit.fitted_curve.length} pts)
          </summary>
          <pre className="code-block" style={{ margin: '0 20px 16px', maxHeight: 140 }}>
            {fit.fitted_curve.map(([n, ms]) => `n=${n}  →  ${ms.toFixed(3)} ms`).join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}
