interface Props { cls: string }

type BadgeStyle = { bg: string; color: string; shadow: string }

const STYLES: Record<string, BadgeStyle> = {
  'O(1)':       { bg: 'rgba(34,197,94,0.12)',  color: '#86efac', shadow: 'rgba(34,197,94,0.25)' },
  'O(log n)':   { bg: 'rgba(16,185,129,0.12)', color: '#6ee7b7', shadow: 'rgba(16,185,129,0.25)' },
  'O(n)':       { bg: 'rgba(234,179,8,0.12)',  color: '#fde047', shadow: 'rgba(234,179,8,0.25)' },
  'O(n log n)': { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', shadow: 'rgba(249,115,22,0.25)' },
  'O(n²)':      { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', shadow: 'rgba(239,68,68,0.25)' },
  'O(n³)':      { bg: 'rgba(220,38,38,0.18)',  color: '#f87171', shadow: 'rgba(220,38,38,0.35)' },
}

const FALLBACK: BadgeStyle = { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', shadow: 'transparent' }

export function ComplexityBadge({ cls }: Props) {
  const s = STYLES[cls] ?? FALLBACK
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        boxShadow: `0 0 10px ${s.shadow}`,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'var(--font-geist-mono)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        border: `1px solid ${s.color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      {cls || '—'}
    </span>
  )
}
