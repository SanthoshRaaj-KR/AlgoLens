import type { FitResult } from '@/lib/types'
import { ComplexityBadge } from './complexity-badge'

interface Props { fit: FitResult }

export function FitResultCard({ fit }: Props) {
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Curve Fit Result</span>
        <ComplexityBadge cls={fit.complexity_class} />
      </div>
      <table className="w-full text-sm">
        <tbody>
          {[
            ['Complexity Class', fit.complexity_class],
            ['Exponent',         fit.exponent.toFixed(4)],
            ['Coefficient',      fit.coefficient.toFixed(6)],
            ['R² Score',         fit.r_squared.toFixed(6)],
            ['Fitted Curve Pts', String(fit.fitted_curve?.length ?? 0)],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-2 text-zinc-500 font-mono text-xs">{label}</td>
              <td className="px-4 py-2 text-zinc-900 font-mono text-xs text-right">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fit.fitted_curve && fit.fitted_curve.length > 0 && (
        <details className="border-t border-zinc-200">
          <summary className="px-4 py-2 text-xs font-mono text-zinc-400 cursor-pointer hover:text-zinc-600">
            Fitted curve data ({fit.fitted_curve.length} points)
          </summary>
          <pre className="px-4 pb-3 text-xs font-mono text-zinc-600 overflow-x-auto max-h-40">
            {fit.fitted_curve.map(([n, ms]) => `n=${n}  →  ${ms.toFixed(3)} ms`).join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}
