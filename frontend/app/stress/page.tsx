'use client'
import { useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts'
import { streamStress } from '@/lib/api'
import { api } from '@/lib/api'
import type { StressStep, StressEvent } from '@/lib/types'
import { useToast } from '@/components/toast'

const DEFAULT_STEPS = '1,5,10,25,50,100'

interface HeaderRow { key: string; value: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="input-label">{label}</label>
      {children}
    </div>
  )
}

export default function StressPage() {
  const [endpoint, setEndpoint] = useState('http://localhost:9000/linear')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('')
  const [steps, setSteps] = useState(DEFAULT_STEPS)
  const [timeoutMs, setTimeoutMs] = useState(5000)
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }])

  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [data, setData] = useState<StressStep[]>([])
  const [breakingPoint, setBreakingPoint] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveTag, setSaveTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)

  function setHeader(i: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
      if (i === next.length - 1 && (next[i].key || next[i].value)) next.push({ key: '', value: '' })
      return next
    })
  }

  function getHeadersMap() {
    return Object.fromEntries(headers.filter(h => h.key).map(h => [h.key, h.value]))
  }

  async function run() {
    setRunning(true); setData([]); setBreakingPoint(null); setDone(false); setSavedId(null)
    const concurrency_steps = steps.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    try {
      for await (const event of streamStress({
        endpoint, method,
        headers: getHeadersMap(),
        body: body || undefined,
        concurrency_steps,
        timeout_ms: timeoutMs,
      })) {
        handleEvent(event)
        if (event.type === 'done' || event.type === 'breaking_point') break
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function handleEvent(ev: StressEvent) {
    if (ev.type === 'step') {
      setData(d => [...d, { concurrency: ev.concurrency, p50: ev.p50, p95: ev.p95, p99: ev.p99, error_rate: ev.error_rate, errors: ev.errors, total: ev.total }])
    } else if (ev.type === 'breaking_point') {
      setBreakingPoint(ev.concurrency)
      setDone(true)
    } else if (ev.type === 'done') {
      setDone(true)
    } else if (ev.type === 'error') {
      toast(ev.message)
    }
  }

  async function saveDeployment() {
    if (!saveName) return
    setSaving(true)
    try {
      const res = await api.saveDeployment({
        endpoint,
        version: new Date().toISOString().slice(0, 10),
        fingerprint_vector: { ComplexityClass: '', ComplexityExponent: 0, MemoryGrowthRate: 0, ConcurrencyCliff: 0, BreakingPoint: breakingPoint ?? 0, ReadWriteRatio: 0 },
        http_method: method,
        name: saveName,
        tag: saveTag,
        mode: 'stress',
        summary: JSON.stringify({ steps: data, breaking_point: breakingPoint }),
      })
      setSavedId(res.id); setShowSave(false)
      toast('Deployment saved', 'success')
    } catch (e) { toast((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>Stress Test</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Hit one endpoint, ramp concurrency, plot the curve live</p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Configuration</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
            <Field label="Endpoint URL">
              <input className="input" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://localhost:9000/api" />
            </Field>
            <Field label="Method">
              <select className="input" value={method} onChange={e => setMethod(e.target.value)} style={{ width: 90 }}>
                {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Concurrency Steps (comma-separated)">
            <input className="input" value={steps} onChange={e => setSteps(e.target.value)} placeholder="1,5,10,25,50,100" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Timeout (ms)">
              <input className="input" type="number" value={timeoutMs} onChange={e => setTimeoutMs(Number(e.target.value))} />
            </Field>
            <Field label="Request Body (optional)">
              <input className="input" value={body} onChange={e => setBody(e.target.value)} placeholder='{"key":"value"}' />
            </Field>
          </div>
          <div>
            <label className="input-label">Headers</label>
            {headers.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Key" value={h.key} onChange={e => setHeader(i, 'key', e.target.value)} />
                <input className="input" style={{ flex: 2 }} placeholder="Value" value={h.value} onChange={e => setHeader(i, 'value', e.target.value)} />
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={run} disabled={running || !endpoint} style={{ alignSelf: 'flex-start' }}>
            {running ? <><span className="spinner" />Running…</> : 'Run Stress Test'}
          </button>
        </div>
      </div>

      {breakingPoint && (
        <div className="anim-fade-in" style={{ padding: '12px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, fontSize: 13, color: '#f87171', fontFamily: 'var(--font-geist-mono)' }}>
          Breaking point detected at concurrency={breakingPoint} — error rate ≥ 50%
        </div>
      )}

      {data.length > 0 && (
        <div className="card anim-fade-in">
          <div className="card-header">
            <span className="card-title">Latency Curve</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>{data.length} steps</span>
          </div>
          <div style={{ padding: '8px 12px 16px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="concurrency" label={{ value: 'Concurrency', position: 'insideBottom', offset: -2, fontSize: 11 }} tick={{ fontSize: 11 }} />
                <YAxis label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}ms`]} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="p50" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} name="p50" />
                <Line type="monotone" dataKey="p95" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} name="p95" />
                <Line type="monotone" dataKey="p99" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} name="p99" />
                {breakingPoint && <ReferenceLine x={breakingPoint} stroke="#ef4444" strokeDasharray="5 3" label={{ value: 'Breaking Point', fill: '#f87171', fontSize: 11 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: 24 }}>
            {data.map(s => (
              <div key={s.concurrency} style={{ fontSize: 11, fontFamily: 'var(--font-geist-mono)', color: s.error_rate > 0 ? '#fbbf24' : 'var(--text-3)' }}>
                c={s.concurrency}: {(s.error_rate * 100).toFixed(0)}% err
              </div>
            ))}
          </div>
          {done && !showSave && !savedId && (
            <div style={{ padding: '0 20px 16px' }}>
              <button className="btn-secondary" onClick={() => setShowSave(true)}>Save as Deployment</button>
            </div>
          )}
          {showSave && (
            <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div><label className="input-label">Name *</label><input className="input" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="my-stress-run" /></div>
              <div><label className="input-label">Tag</label><input className="input" value={saveTag} onChange={e => setSaveTag(e.target.value)} placeholder="pre-launch" /></div>
              <button className="btn-primary" onClick={saveDeployment} disabled={saving || !saveName}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn-secondary" onClick={() => setShowSave(false)}>Cancel</button>
            </div>
          )}
          {savedId && <div style={{ padding: '0 20px 16px', fontSize: 12, color: '#4ade80', fontFamily: 'var(--font-geist-mono)' }}>Saved as deployment #{savedId}</div>}
        </div>
      )}
    </div>
  )
}
