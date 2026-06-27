'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface Series { label: string; color: string; curve: [number, number][] }
interface Props { series: Series[] }

const TICK = { fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }
const TT = { background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 10, fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }

export function CurveChart({ series }: Props) {
  if (!series.length) return null
  const allNs = [...new Set(series.flatMap(s => s.curve.map(([n]) => n)))].sort((a, b) => a - b)
  const data = allNs.map(n => {
    const row: Record<string, number> = { n }
    series.forEach(s => { const pt = s.curve.find(([pn]) => pn === n); if (pt) row[s.label] = parseFloat(pt[1].toFixed(3)) })
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="n" tick={TICK} axisLine={{ stroke: 'var(--border-mid)' }} tickLine={false} label={{ value: 'n (input size)', position: 'insideBottom', offset: -10, fill: 'var(--text-3)', fontSize: 11 }} />
        <YAxis tick={TICK} axisLine={{ stroke: 'var(--border-mid)' }} tickLine={false} label={{ value: 'latency (ms)', angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 11 }} />
        <Tooltip contentStyle={TT} labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }} cursor={{ stroke: 'var(--border-mid)' }} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: 'var(--text-2)', paddingTop: 8 }} />
        {series.map(s => <Line key={s.label} dataKey={s.label} stroke={s.color} dot={false} strokeWidth={2.5} activeDot={{ r: 4, fill: 'var(--bg-card)', stroke: s.color, strokeWidth: 2 }} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}
