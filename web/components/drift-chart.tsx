'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import type { Deployment } from '@/lib/types'

interface Props { deployments: Deployment[] }

export function DriftChart({ deployments }: Props) {
  const data = deployments.map(d => ({
    version: d.Version,
    exponent: parseFloat(d.Vector.ComplexityExponent.toFixed(3)),
    mem_growth: parseFloat(d.Vector.MemoryGrowthRate.toFixed(4)),
    cliff: d.Vector.ConcurrencyCliff,
    breaking: d.Vector.BreakingPoint,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="version" tick={{ fontFamily: 'monospace', fontSize: 11 }} />
        <YAxis tick={{ fontFamily: 'monospace', fontSize: 11 }} />
        <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
        <Line dataKey="exponent"   name="Complexity Exponent" stroke="#18181b" dot strokeWidth={2} />
        <Line dataKey="mem_growth" name="Mem Growth Rate"     stroke="#3b82f6" dot strokeWidth={1} strokeDasharray="4 2" />
        <Line dataKey="cliff"      name="Concurrency Cliff"   stroke="#f59e0b" dot strokeWidth={1} strokeDasharray="4 2" />
        <Line dataKey="breaking"   name="Breaking Point"      stroke="#ef4444" dot strokeWidth={1} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  )
}
