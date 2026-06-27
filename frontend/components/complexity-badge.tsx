interface Props { cls: string }

type S = { bg: string; color: string; border: string }

const MAP: Record<string, S> = {
  'O(1)':       { bg: 'rgba(16,185,129,0.1)',  color: '#34d399', border: 'rgba(16,185,129,0.3)'  },
  'O(log n)':   { bg: 'rgba(6,182,212,0.1)',   color: '#22d3ee', border: 'rgba(6,182,212,0.3)'   },
  'O(n)':       { bg: 'rgba(245,158,11,0.1)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)'  },
  'O(n log n)': { bg: 'rgba(249,115,22,0.1)',  color: '#fb923c', border: 'rgba(249,115,22,0.3)'  },
  'O(n²)':      { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.3)'   },
  'O(n³)':      { bg: 'rgba(220,38,38,0.15)',  color: '#ef4444', border: 'rgba(220,38,38,0.4)'   },
}
const FALLBACK: S = { bg: 'rgba(74,80,117,0.15)', color: 'var(--text-3)', border: 'var(--border-mid)' }

export function ComplexityBadge({ cls }: Props) {
  const s = MAP[cls] ?? FALLBACK
  return (
    <span className="tag" style={{ background: s.bg, color: s.color, borderColor: s.border, boxShadow: `0 0 8px ${s.border}` }}>
      {cls || '—'}
    </span>
  )
}
