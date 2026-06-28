'use client'
import { useState, useEffect, useRef } from 'react'
import { api, agentStreamURL } from '@/lib/api'
import type { SpecEndpoint, AgentPlan, AgentEvent } from '@/lib/types'

interface HeaderRow { key: string; value: string }

function getHeadersMap(rows: HeaderRow[]) {
  return Object.fromEntries(rows.filter(h => h.key).map(h => [h.key, h.value]))
}

type Step = 'config' | 'plans' | 'running' | 'done'

export default function SimulationPage() {
  const [step, setStep] = useState<Step>('config')

  // Step 1 — config
  const [specUrl, setSpecUrl] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [goal, setGoal] = useState('Test the full API flow')
  const [nAgents, setNAgents] = useState(3)
  const [validating, setValidating] = useState(false)
  const [endpoints, setEndpoints] = useState<SpecEndpoint[]>([])
  const [specTitle, setSpecTitle] = useState('')
  const [validateError, setValidateError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // Step 2 — plans
  const [planning, setPlanning] = useState(false)
  const [plans, setPlans] = useState<AgentPlan[]>([])
  const [planErrors, setPlanErrors] = useState<string[]>([])

  // Step 3 — running
  const [runName, setRunName] = useState('')
  const [runTag, setRunTag] = useState('')
  const [agentEvents, setAgentEvents] = useState<Record<number, AgentEvent[]>>({})
  const [groupDone, setGroupDone] = useState<{ success_count: number; fail_count: number } | null>(null)
  const esRef = useRef<EventSource | null>(null)

  function setHeader(i: number, field: 'key' | 'value', val: string) {
    setHeaders(prev => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
      if (i === next.length - 1 && (next[i].key || next[i].value)) next.push({ key: '', value: '' })
      return next
    })
  }

  async function validate() {
    setValidating(true); setValidateError(null); setWarnings([])
    try {
      const res = await api.specValidate(specUrl, baseUrl, getHeadersMap(headers))
      if (!res.valid) { setValidateError(res.error); return }
      setSpecTitle(res.spec_title)
      setEndpoints(res.endpoints)
      setWarnings(res.warnings)
      setStep('plans')
    } catch (e) { setValidateError((e as Error).message) } finally { setValidating(false) }
  }

  async function generatePlans() {
    setPlanning(true); setPlanErrors([])
    try {
      const res = await api.agentPlan(specUrl, goal, nAgents)
      setPlans(res.plans)
      setPlanErrors(res.validation_errors)
    } catch (e) { setPlanErrors([(e as Error).message]) } finally { setPlanning(false) }
  }

  async function runSimulation() {
    if (!runName) return
    setStep('running')
    setAgentEvents({})
    setGroupDone(null)
    try {
      const res = await api.agentRun(specUrl, plans, baseUrl, getHeadersMap(headers), goal, runName, runTag)
      const url = agentStreamURL(res.session_group_id)
      const es = new EventSource(url)
      esRef.current = es
      es.onmessage = (ev) => {
        try {
          const event: AgentEvent = JSON.parse(ev.data)
          if (event.type === 'group_done') {
            setGroupDone({ success_count: event.success_count, fail_count: event.fail_count })
            setStep('done')
            es.close()
          } else if ('session_id' in event) {
            const sid = event.session_id
            setAgentEvents(prev => ({ ...prev, [sid]: [...(prev[sid] ?? []), event] }))
          }
        } catch { /* skip parse errors */ }
      }
      es.onerror = () => { es.close(); setStep('done') }
    } catch (e) {
      setPlanErrors([(e as Error).message]); setStep('plans')
    }
  }

  useEffect(() => () => { esRef.current?.close() }, [])

  const personaColor: Record<string, string> = {
    'power user': '#a78bfa', 'casual user': '#4ade80',
    'adversarial': '#f87171', 'first-time user': '#fbbf24', 'api integrator': '#60a5fa',
  }

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>Simulation</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Claude agents test your API concurrently from a Swagger spec</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['config','plans','running','done'] as Step[]).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '3px 12px', borderRadius: 99, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-geist-mono)', background: step === s ? 'var(--accent-sub)' : 'transparent', color: step === s ? 'var(--accent-light)' : 'var(--text-3)', border: `1px solid ${step === s ? 'var(--accent-light)' : 'var(--border)'}` }}>
              {i + 1}. {s}
            </span>
            {i < 3 && <span style={{ color: 'var(--border-mid)', fontSize: 12 }}>→</span>}
          </div>
        ))}
      </div>

      {/* Step 1 — Config */}
      {(step === 'config' || step === 'plans') && (
        <div className="card">
          <div className="card-header"><span className="card-title">1. API Spec</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input-label">Swagger / OpenAPI Spec URL</label>
              <input className="input" value={specUrl} onChange={e => setSpecUrl(e.target.value)} placeholder="https://petstore.swagger.io/v2/swagger.json" />
            </div>
            <div>
              <label className="input-label">Base URL (overrides spec servers[0])</label>
              <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
            </div>
            <div>
              <label className="input-label">Auth Headers</label>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input className="input" style={{ flex: 1 }} placeholder="Authorization" value={h.key} onChange={e => setHeader(i, 'key', e.target.value)} />
                  <input className="input" style={{ flex: 2 }} placeholder="Bearer token..." value={h.value} onChange={e => setHeader(i, 'value', e.target.value)} />
                </div>
              ))}
            </div>
            {validateError && <div className="error-box">{validateError}</div>}
            {warnings.length > 0 && warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#fbbf24', fontFamily: 'var(--font-geist-mono)' }}>⚠ {w}</div>)}
            <button className="btn-primary" onClick={validate} disabled={validating || !specUrl} style={{ alignSelf: 'flex-start' }}>
              {validating ? <><span className="spinner" />Validating…</> : 'Validate Spec'}
            </button>
          </div>
        </div>
      )}

      {/* Discovered endpoints */}
      {step === 'plans' && endpoints.length > 0 && (
        <div className="card anim-fade-in">
          <div className="card-header"><span className="card-title">{specTitle} — {endpoints.length} endpoints</span></div>
          <div style={{ padding: '8px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {endpoints.map((ep, i) => (
              <span key={i} style={{ fontSize: 11, fontFamily: 'var(--font-geist-mono)', padding: '3px 10px', borderRadius: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <span style={{ color: '#a78bfa' }}>{ep.method}</span> {ep.path}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Generate Plans */}
      {step === 'plans' && (
        <div className="card anim-fade-in">
          <div className="card-header"><span className="card-title">2. Generate Agent Plans</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="input-label">Goal</label>
              <input className="input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Test the full CRUD flow" />
            </div>
            <div>
              <label className="input-label">Number of Agents (1–10)</label>
              <input className="input" type="number" min={1} max={10} value={nAgents} onChange={e => setNAgents(Number(e.target.value))} style={{ width: 80 }} />
            </div>
            {planErrors.length > 0 && planErrors.map((e, i) => <div key={i} className="error-box">{e}</div>)}
            <button className="btn-primary" onClick={generatePlans} disabled={planning} style={{ alignSelf: 'flex-start' }}>
              {planning ? <><span className="spinner" />Planning (Claude is thinking…)</> : 'Generate Plans'}
            </button>
          </div>
        </div>
      )}

      {/* Plan cards */}
      {step === 'plans' && plans.length > 0 && (
        <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 14 }}>
            {plans.map(p => (
              <div key={p.agent_id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: `1px solid ${personaColor[p.persona] ?? '#888'}40`, color: personaColor[p.persona] ?? '#888', background: `${personaColor[p.persona] ?? '#888'}15`, fontFamily: 'var(--font-geist-mono)' }}>Agent {p.agent_id}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.persona}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)', marginBottom: 6 }}>{p.input_slice}</div>
                <ol style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.action_plan.map((s, i) => <li key={i} style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-geist-mono)' }}>{s}</li>)}
                </ol>
                <div style={{ marginTop: 8, fontSize: 11, color: '#4ade80', fontFamily: 'var(--font-geist-mono)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>✓ {p.success_condition}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><label className="input-label">Deployment Name *</label><input className="input" value={runName} onChange={e => setRunName(e.target.value)} placeholder="sim-run-v1" /></div>
              <div><label className="input-label">Tag</label><input className="input" value={runTag} onChange={e => setRunTag(e.target.value)} placeholder="pre-launch" /></div>
              <button className="btn-primary" onClick={runSimulation} disabled={!runName || plans.length === 0}>Run Simulation →</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Live agent panels */}
      {(step === 'running' || step === 'done') && (
        <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: step === 'running' ? '#fbbf24' : '#4ade80', fontFamily: 'var(--font-geist-mono)' }}>
              {step === 'running' ? '● Running…' : '✓ Done'}
            </span>
            {groupDone && <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>{groupDone.success_count} succeeded · {groupDone.fail_count} failed</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: 14 }}>
            {plans.map(p => {
              const events = agentEvents[p.agent_id] ?? []
              const isDone = events.some(e => e.type === 'done')
              const doneEvent = events.find(e => e.type === 'done') as ({ type: 'done'; success: boolean; turns: number } | undefined)
              return (
                <div key={p.agent_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: `1px solid ${personaColor[p.persona] ?? '#888'}40`, color: personaColor[p.persona] ?? '#888', background: `${personaColor[p.persona] ?? '#888'}15`, fontFamily: 'var(--font-geist-mono)' }}>Agent {p.agent_id}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{p.persona}</span>
                    {isDone && <span style={{ fontSize: 11, color: doneEvent?.success ? '#4ade80' : '#f87171', fontFamily: 'var(--font-geist-mono)' }}>{doneEvent?.success ? `✓ ${doneEvent.turns}t` : '✗'}</span>}
                    {!isDone && step === 'running' && <span style={{ fontSize: 10, color: '#fbbf24', fontFamily: 'var(--font-geist-mono)' }}>●</span>}
                  </div>
                  <div style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {events.map((ev, i) => {
                      if (ev.type === 'reasoning') return (
                        <div key={i} style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)', fontStyle: 'italic', paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>{ev.text}</div>
                      )
                      if (ev.type === 'request') return (
                        <div key={i} style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'var(--font-geist-mono)' }}>→ {ev.method} {ev.url}</div>
                      )
                      if (ev.type === 'response') return (
                        <div key={i} style={{ fontSize: 11, color: ev.status_code >= 400 ? '#f87171' : '#4ade80', fontFamily: 'var(--font-geist-mono)' }}>← {ev.status_code} ({ev.latency_ms?.toFixed(0)}ms){ev.error ? ` — ${ev.error}` : ''}</div>
                      )
                      if (ev.type === 'done') return (
                        <div key={i} style={{ fontSize: 11, color: ev.success ? '#4ade80' : '#f87171', fontFamily: 'var(--font-geist-mono)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>{ev.success ? `Done in ${ev.turns} turns` : `Failed: ${ev.reason}`}</div>
                      )
                      return null
                    })}
                    {events.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-geist-mono)' }}>Waiting…</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
