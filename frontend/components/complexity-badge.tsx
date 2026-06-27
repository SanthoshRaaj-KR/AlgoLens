interface Props { cls: string }

const colors: Record<string, string> = {
  'O(1)':       'bg-green-100 text-green-800',
  'O(log n)':   'bg-green-100 text-green-800',
  'O(n)':       'bg-yellow-100 text-yellow-800',
  'O(n log n)': 'bg-orange-100 text-orange-800',
  'O(n²)':      'bg-red-100 text-red-800',
  'O(n³)':      'bg-red-200 text-red-900',
}

export function ComplexityBadge({ cls }: Props) {
  const color = colors[cls] ?? 'bg-zinc-100 text-zinc-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${color}`}>
      {cls || '—'}
    </span>
  )
}
