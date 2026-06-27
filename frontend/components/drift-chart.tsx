'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Deployment } from '@/lib/types'

interface Props { deployments: Deployment[] }

const TICK = { fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-geist-mono)' }
const TT = { background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 10, fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: 'var(--text)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }

export function DriftChart({ deployments }: Props) {
  const data = deployments.map(d => ({
    version:    d.Version,
    exponent:   parseFloat(d.Vector.ComplexityExponent.toFixed(3)),
    mem_growth: parseFloat(d.Vector.MemoryGrowthRate.toFixed(4)),
    cliff:      d.Vector.ConcurrencyCliff,
    breaking:   d.Vector.BreakingPoint,
  }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="version" tick={TICK} axisLine={{ stroke: 'var(--border-mid)' }} tickLine={false} />
        <YAxis tick={TICK} axisLine={{ stroke: 'var(--border-mid)' }} tickLine={false} />
        <Tooltip contentStyle={TT} labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }} cursor={{ stroke: 'var(--border-mid)' }} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: 'var(--text-2)', paddingTop: 8 }} />
        <Line dataKey="exponent"   name="Complexity Exponent" stroke="#a78bfa" strokeWidth={2.5} dot activeDot={{ r: 4, fill: 'var(--bg-card)' }} />
        <Line dataKey="mem_growth" name="Mem Growth Rate"     stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 2" dot activeDot={{ r: 4, fill: 'var(--bg-card)' }} />
        <Line dataKey="cliff"      name="Concurrency Cliff"   stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 2" dot activeDot={{ r: 4, fill: 'var(--bg-card)' }} />
        <Line dataKey="breaking"   name="Breaking Point"      stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 2" dot activeDot={{ r: 4, fill: 'var(--bg-card)' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
