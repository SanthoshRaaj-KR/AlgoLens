'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface Series {
  label: string
  color: string
  curve: [number, number][]
}

interface Props { series: Series[] }

const TICK = { fill: '#64748b', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }
const TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  fontFamily: 'var(--font-geist-mono)',
  fontSize: 12,
  color: '#e2e8f0',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
}

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
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="n"
          tick={TICK}
          axisLine={{ stroke: '#334155' }}
          tickLine={{ stroke: '#334155' }}
          label={{ value: 'n (input size)', position: 'insideBottom', offset: -10, fill: '#475569', fontSize: 11 }}
        />
        <YAxis
          tick={TICK}
          axisLine={{ stroke: '#334155' }}
          tickLine={{ stroke: '#334155' }}
          label={{ value: 'latency (ms)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 11 }}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#94a3b8', marginBottom: 4 }} cursor={{ stroke: '#334155' }} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
        {series.map(s => (
          <Line
            key={s.label}
            dataKey={s.label}
            stroke={s.color}
            dot={false}
            strokeWidth={2}
            activeDot={{ r: 4, stroke: s.color, strokeWidth: 2, fill: '#0f172a' }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
