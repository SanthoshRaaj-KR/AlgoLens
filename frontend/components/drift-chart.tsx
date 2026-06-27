'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Deployment } from '@/lib/types'

interface Props { deployments: Deployment[] }

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

export function DriftChart({ deployments }: Props) {
  const data = deployments.map(d => ({
    version: d.Version,
    exponent:   parseFloat(d.Vector.ComplexityExponent.toFixed(3)),
    mem_growth: parseFloat(d.Vector.MemoryGrowthRate.toFixed(4)),
    cliff:      d.Vector.ConcurrencyCliff,
    breaking:   d.Vector.BreakingPoint,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="version" tick={TICK} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
        <YAxis tick={TICK} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#94a3b8', marginBottom: 4 }} cursor={{ stroke: '#334155' }} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-geist-mono)', fontSize: 12, color: '#94a3b8', paddingTop: 8 }} />
        <Line dataKey="exponent"   name="Complexity Exponent" stroke="#818cf8" dot strokeWidth={2} activeDot={{ r: 4, fill: '#0f172a' }} />
        <Line dataKey="mem_growth" name="Mem Growth Rate"     stroke="#34d399" dot strokeWidth={1.5} strokeDasharray="4 2" activeDot={{ r: 4, fill: '#0f172a' }} />
        <Line dataKey="cliff"      name="Concurrency Cliff"   stroke="#fbbf24" dot strokeWidth={1.5} strokeDasharray="4 2" activeDot={{ r: 4, fill: '#0f172a' }} />
        <Line dataKey="breaking"   name="Breaking Point"      stroke="#f87171" dot strokeWidth={1.5} strokeDasharray="4 2" activeDot={{ r: 4, fill: '#0f172a' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
