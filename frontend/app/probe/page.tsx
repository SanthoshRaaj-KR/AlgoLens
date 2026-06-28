'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { ProbeResponse } from '@/lib/types'
import { SweepTable } from '@/components/sweep-table'
import { FingerprintCard } from '@/components/fingerprint-card'
import { FitResultCard } from '@/components/fit-result-card'
import { CurveChart } from '@/components/curve-chart'

const DEFAULTS = {
  endpoint: 'http://localhost:9000/linear?n={{n}}',
  method: 'GET',
  payload_template: '',
  input_sizes: '1,2,4,8,16,32,64,128',
  concurrency_levels: '1,2,4',
  warmup_rounds: 3,
  samples_per_step: 5,
  timeout_ms: 5000,
}

const parseInts = (s: string) => s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n))

interface HeaderRow { key: string; value: string }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="input-label">{label}{hint && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-3)', opacity: 0.8 }}>{hint}</span>}</label>
      {children}
    </div>
  )
}

export default function ProbePage() {
  const [form, setForm] = useState(DEFAULTS)
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ProbeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showSave, setShowSave] = useState(false)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)

  useEffect(() => {
    if (!running) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  function setHeader(i: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
      // auto-add a new empty row when typing in the last row
      if (i === next.length - 1 && (next[i].key || next[i].value)) next.push({ key: '', value: '' })
      return next
    })
  }

  function removeHeader(i: number) {
    setHeaders(prev => prev.length === 1 ? [{ key: '', value: '' }] : prev.filter((_, idx) => idx !== i))
  }

  function headersToMap(): Record<string, string> {
    const out: Record<string, string> = {}
    headers.forEach(({ key, value }) => { if (key.trim()) out[key.trim()] = value.trim() })
    return out
  }

  function headersToJSON(): string {
    const map = headersToMap()
    return Object.keys(map).length ? JSON.stringify(map) : ''
  }

  async function run() {
    setRunning(true); setError(null); setResult(null); setSavedId(null)
    try {
      setResult(await api.probe({
        endpoint: form.endpoint,
        method: form.method,
        payload_template: form.payload_template || undefined,
        headers: headersToMap(),
        input_sizes: parseInts(form.input_sizes),
        concurrency_levels: parseInts(form.concurrency_levels),
        warmup_rounds: Number(form.warmup_rounds),
        samples_per_step: Number(form.samples_per_step),
        timeout_ms: Number(form.timeout_ms),
      }))
    } catch (e) { setError((e as Error).message) }
    finally { setRunning(false) }
  }

  async function save() {
    if (!result || !version.trim()) return
    setSaving(true)
    try {
      const { id } = await api.saveDeployment({
        endpoint: form.endpoint,
        version: version.trim(),
        notes: notes.trim() || undefined,
        fingerprint_vector: result.fingerprint_vector,
        fitted_curve: JSON.stringify(result.fit_result.fitted_curve),
        sweep_result: JSON.stringify(result.sweep_points),
        headers_json: headersToJSON(),
        payload_template: form.payload_template || undefined,
        http_method: form.method,
      })
      setSavedId(id); setShowSave(false); setVersion(''); setNotes('')
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const filledHeaders = headers.filter(h => h.key.trim())

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>Run Probe</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Sweep an HTTP endpoint to fingerprint its complexity</p>
      </div>

      {/* Endpoint */}
      <div className="card">
        <div className="card-header"><span className="card-title">Endpoint</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10 }}>
            <div>
              <label className="input-label">Method</label>
              <select value={form.method} onChange={f('method')} className="input" style={{ cursor: 'pointer' }}>
                {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Field label="URL" hint="use {{n}} as the size variable">
              <input value={form.endpoint} onChange={f('endpoint')} className="input" placeholder="http://localhost:9000/linear?n={{n}}" />
            </Field>
          </div>
          {(form.method === 'POST' || form.method === 'PUT' || form.method === 'PATCH') && (
            <Field label="Payload Template" hint="{{n}} is substituted at probe time">
              <textarea value={form.payload_template} onChange={f('payload_template')} rows={3} className="input" style={{ resize: 'vertical', fontFamily: 'var(--font-geist-mono)' }} placeholder={'{"batch_size": {{n}}, "items": []}'} />
            </Field>
          )}
        </div>
      </div>

      {/* Headers */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Custom Headers</span>
          {filledHeaders.length > 0 && <span style={{ fontSize: 11, color: 'var(--accent-light)', fontFamily: 'var(--font-geist-mono)' }}>{filledHeaders.length} active</span>}
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>
            Add any HTTP headers — Authorization, X-API-Key, Content-Type overrides, etc.
          </p>
          {headers.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: 8, alignItems: 'center' }}>
              <input
                value={row.key}
                onChange={e => setHeader(i, 'key', e.target.value)}
                className="input"
                placeholder="Header name"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              />
              <input
                value={row.value}
                onChange={e => setHeader(i, 'value', e.target.value)}
                className="input"
                placeholder="Value"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              />
              <button
                onClick={() => removeHeader(i)}
                style={{ width: 32, height: 38, borderRadius: 8, border: '1px solid var(--border-mid)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}
                title="Remove"
              >×</button>
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>
              Common: <code style={{ color: 'var(--accent-light)' }}>Authorization</code> · <code style={{ color: 'var(--accent-light)' }}>X-API-Key</code> · <code style={{ color: 'var(--accent-light)' }}>X-Tenant-ID</code>
            </div>
          </div>
        </div>
      </div>

      {/* Sweep params */}
      <div className="card">
        <div className="card-header"><span className="card-title">Sweep Parameters</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Input sizes (csv)"><input value={form.input_sizes} onChange={f('input_sizes')} className="input" /></Field>
          <Field label="Concurrency levels (csv)"><input value={form.concurrency_levels} onChange={f('concurrency_levels')} className="input" /></Field>
          <Field label="Warmup rounds"><input type="number" value={form.warmup_rounds} onChange={f('warmup_rounds')} className="input" /></Field>
          <Field label="Samples per step"><input type="number" value={form.samples_per_step} onChange={f('samples_per_step')} className="input" /></Field>
          <Field label="Timeout (ms)" hint="per request"><input type="number" value={form.timeout_ms} onChange={f('timeout_ms')} className="input" /></Field>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={run} disabled={running} className="btn-primary">
            {running ? <><span className="spinner" />Running… {elapsed}s</> : 'Run Probe'}
          </button>
        </div>
      </div>

      {error && <div className="error-box anim-fade-in">{error}</div>}

      {result && (
        <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>
              {result.sweep_points.length} probe points · {result.estimated_duration}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {savedId !== null && <span className="success-box" style={{ padding: '5px 12px', fontSize: 12 }}>Saved as #{savedId}</span>}
              <button onClick={() => setShowSave(true)} className="btn-secondary">Save as Deployment</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FingerprintCard v={result.fingerprint_vector} />
            <FitResultCard fit={result.fit_result} />
          </div>
          {result.fit_result.fitted_curve?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Fitted Curve</span></div>
              <div className="card-body"><CurveChart series={[{ label: result.fingerprint_vector.ComplexityClass, color: '#a78bfa', curve: result.fit_result.fitted_curve }]} /></div>
            </div>
          )}
          <div className="card">
            <div className="card-header"><span className="card-title">Latency Matrix</span></div>
            <div className="card-body"><SweepTable points={result.sweep_points} /></div>
          </div>
        </div>
      )}

      {showSave && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowSave(false) }}>
          <div className="modal-box" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Save Deployment</h2>
            <div><label className="input-label">Version tag *</label><input value={version} onChange={e => setVersion(e.target.value)} className="input" placeholder="v1.2.0" autoFocus /></div>
            <div><label className="input-label">Notes (optional)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input" style={{ resize: 'vertical' }} placeholder="baseline after refactor" /></div>
            {filledHeaders.length > 0 && (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-geist-mono)', marginBottom: 6 }}>Headers saved with this deployment</div>
                {filledHeaders.map((h, i) => <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-geist-mono)' }}><span style={{ color: 'var(--accent-light)' }}>{h.key}</span>: {h.value}</div>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSave(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving || !version.trim()} className="btn-primary">{saving ? <><span className="spinner" />Saving…</> : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
