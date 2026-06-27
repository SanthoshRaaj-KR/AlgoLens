'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { ProbeResponse } from '@/lib/types'
import { SweepTable } from '@/components/sweep-table'
import { FingerprintCard } from '@/components/fingerprint-card'
import { FitResultCard } from '@/components/fit-result-card'
import { CurveChart } from '@/components/curve-chart'

const DEFAULTS = { endpoint: 'http://localhost:9000/linear?n={{n}}', method: 'GET', payload_template: '', input_sizes: '1,2,4,8,16,32,64,128', concurrency_levels: '1,2,4', warmup_rounds: 3, samples_per_step: 5, timeout_ms: 5000 }
const parseInts = (s: string) => s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="input-label">{label}</label>{children}</div>
}

export default function ProbePage() {
  const [form, setForm] = useState(DEFAULTS)
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

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  async function run() {
    setRunning(true); setError(null); setResult(null); setSavedId(null)
    try { setResult(await api.probe({ endpoint: form.endpoint, method: form.method, payload_template: form.payload_template || undefined, input_sizes: parseInts(form.input_sizes), concurrency_levels: parseInts(form.concurrency_levels), warmup_rounds: Number(form.warmup_rounds), samples_per_step: Number(form.samples_per_step), timeout_ms: Number(form.timeout_ms) })) }
    catch (e) { setError((e as Error).message) }
    finally { setRunning(false) }
  }

  async function save() {
    if (!result || !version.trim()) return
    setSaving(true)
    try { const { id } = await api.saveDeployment({ endpoint: form.endpoint, version: version.trim(), notes: notes.trim() || undefined, fingerprint_vector: result.fingerprint_vector, fitted_curve: JSON.stringify(result.fit_result.fitted_curve), sweep_result: JSON.stringify(result.sweep_points) }); setSavedId(id); setShowSave(false); setVersion(''); setNotes('') }
    catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>Run Probe</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Sweep an HTTP endpoint to fingerprint its complexity</p>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Probe Configuration</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Endpoint URL — use {{n}} as the size variable">
              <input value={form.endpoint} onChange={f('endpoint')} className="input" placeholder="http://localhost:9000/search?limit={{n}}" />
            </Field>
          </div>
          <Field label="HTTP Method"><input value={form.method} onChange={f('method')} className="input" /></Field>
          <Field label="Payload Template (POST)"><input value={form.payload_template} onChange={f('payload_template')} className="input" placeholder={`{"limit":{{n}}}`} /></Field>
          <Field label="Input sizes (csv)"><input value={form.input_sizes} onChange={f('input_sizes')} className="input" /></Field>
          <Field label="Concurrency levels (csv)"><input value={form.concurrency_levels} onChange={f('concurrency_levels')} className="input" /></Field>
          <Field label="Warmup rounds"><input type="number" value={form.warmup_rounds} onChange={f('warmup_rounds')} className="input" /></Field>
          <Field label="Samples per step"><input type="number" value={form.samples_per_step} onChange={f('samples_per_step')} className="input" /></Field>
          <Field label="Timeout (ms)"><input type="number" value={form.timeout_ms} onChange={f('timeout_ms')} className="input" /></Field>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={run} disabled={running} className="btn-primary">
            {running ? <><span className="spinner" />Running… {elapsed}s</> : <>Run Probe</>}
          </button>
        </div>
      </div>

      {error && <div className="error-box anim-fade-in">{error}</div>}

      {result && (
        <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>{result.sweep_points.length} probe points · {result.estimated_duration}</span>
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
            <div className="card"><div className="card-header"><span className="card-title">Fitted Curve</span></div><div className="card-body"><CurveChart series={[{ label: result.fingerprint_vector.ComplexityClass, color: '#a78bfa', curve: result.fit_result.fitted_curve }]} /></div></div>
          )}
          <div className="card"><div className="card-header"><span className="card-title">Latency Matrix</span></div><div className="card-body"><SweepTable points={result.sweep_points} /></div></div>
        </div>
      )}

      {showSave && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowSave(false) }}>
          <div className="modal-box" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Save Deployment</h2>
            <div><label className="input-label">Version tag *</label><input value={version} onChange={e => setVersion(e.target.value)} className="input" placeholder="v1.2.0" autoFocus /></div>
            <div><label className="input-label">Notes (optional)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input" style={{ resize: 'vertical' }} placeholder="baseline after refactor" /></div>
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
