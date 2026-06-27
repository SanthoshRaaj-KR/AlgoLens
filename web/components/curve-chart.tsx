'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface Series {
  label: string
  color: string
  curve: [number, number][]
}

interface Props { series: Series[] }

export function CurveChart({ series }: Props) {
  if (!series.length) return null

  const allNs = [...new Set(series.flatMap(s => s.curve.map(([n]) => n)))].sort((a, b) => a - b)
  const data = allNs.map(n => {
    const row: Record<string, number> = { n }
    series.forEach(s => {
      const pt = s.curve.find(([pn]) => pn === n)
      if (pt) row[s.label] = parseFloat(pt[1].toFixed(3))
    })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="n" tick={{ fontFamily: 'monospace', fontSize: 11 }} label={{ value: 'n (input size)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
        <YAxis tick={{ fontFamily: 'monospace', fontSize: 11 }} label={{ value: 'latency (ms)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
        <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
        {series.map(s => (
          <Line key={s.label} dataKey={s.label} stroke={s.color} dot={false} strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
