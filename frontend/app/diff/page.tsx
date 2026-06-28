'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { DiffResponse } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import { CurveChart } from '@/components/curve-chart'

const LABELS: Record<string, string> = { complexity_exponent: 'Complexity Exponent', memory_growth_rate: 'Memory Growth Rate', concurrency_cliff: 'Concurrency Cliff', breaking_point: 'Breaking Point (n)', read_write_ratio: 'Read/Write Ratio' }

export default function DiffPage() {
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!a || !b) return; setLoading(true); setError(null)
    try { setResult(await api.diff(Number(a), Number(b))) } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  const curveA: [number,number][] = result ? (() => { try { return JSON.parse(result.deployment_a.FittedCurveJSON) } catch { return [] } })() : []
  const curveB: [number,number][] = result ? (() => { try { return JSON.parse(result.deployment_b.FittedCurveJSON) } catch { return [] } })() : []

  return (
    <div className="anim-fade-up" style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div>
        <h1 style={{ fontSize:28, fontWeight:700, color:'var(--text)', letterSpacing:'-0.03em', margin:0 }}>Diff</h1>
        <p style={{ margin:'6px 0 0', fontSize:13, color:'var(--text-3)', fontFamily:'var(--font-geist-mono)' }}>Compare two saved deployments side by side</p>
      </div>
      <div className="card">
        <div className="card-body" style={{ display:'flex', alignItems:'flex-end', gap:14 }}>
          <div><label className="input-label">Deployment A</label><input value={a} onChange={e=>setA(e.target.value)} type="number" className="input" style={{width:110}} placeholder="1" onKeyDown={e=>e.key==='Enter'&&run()} /></div>
          <div style={{ color:'var(--border-mid)', fontSize:22, paddingBottom:8, fontWeight:300 }}>vs</div>
          <div><label className="input-label">Deployment B</label><input value={b} onChange={e=>setB(e.target.value)} type="number" className="input" style={{width:110}} placeholder="2" onKeyDown={e=>e.key==='Enter'&&run()} /></div>
          <button onClick={run} disabled={loading||!a||!b} className="btn-primary">{loading?<><span className="spinner"/>Comparing…</>:'Compare'}</button>
        </div>
      </div>
      {error && <div className="error-box anim-fade-in">{error}</div>}
      {result && (
        <div className="anim-fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[result.deployment_a, result.deployment_b].map((d,i)=>(
              <div key={i} className="card" style={{ padding:18 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background:i===0?'rgba(124,58,237,0.15)':'rgba(239,68,68,0.12)', color:i===0?'#a78bfa':'#f87171', fontFamily:'var(--font-geist-mono)', border:`1px solid ${i===0?'rgba(167,139,250,0.3)':'rgba(248,113,113,0.3)'}` }}>{i===0?'A':'B'}</span>
                  <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--font-geist-mono)' }}>#{d.ID}</span>
                  <ComplexityBadge cls={d.Vector.ComplexityClass} />
                </div>
                <p style={{ fontSize:13, color:'var(--text)', margin:'0 0 4px', fontFamily:'var(--font-geist-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={d.Endpoint}>{d.Endpoint}</p>
                <p style={{ fontSize:12, color:'var(--text-3)', margin:0, fontFamily:'var(--font-geist-mono)' }}>{d.Version} · {new Date(d.CreatedAt).toLocaleDateString()}{d.Notes&&` · ${d.Notes}`}</p>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Summary</span></div>
            <ul style={{ margin:0, padding:'10px 20px 14px', listStyle:'none', display:'flex', flexDirection:'column', gap:7 }}>
              {result.summary.map((s,i)=><li key={i} style={{ fontSize:13, color:'var(--text-2)', fontFamily:'var(--font-geist-mono)', paddingLeft:14, borderLeft:'2px solid var(--border-mid)' }}>{s}</li>)}
            </ul>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Field Deltas</span></div>
            <table className="data-table">
              <thead><tr><th>Field</th><th style={{textAlign:'right'}}>A</th><th style={{textAlign:'right'}}>B</th><th style={{textAlign:'right'}}>Delta</th><th style={{textAlign:'center',width:36}}/></tr></thead>
              <tbody>
                {result.deltas.map(d=>(
                  <tr key={d.field}>
                    <td style={{ color:'var(--text-2)' }}>{LABELS[d.field]??d.field}</td>
                    <td style={{ textAlign:'right', color:'var(--text)' }}>{d.a.toFixed(4)}</td>
                    <td style={{ textAlign:'right', color:'var(--text)' }}>{d.b.toFixed(4)}</td>
                    <td style={{ textAlign:'right', fontWeight:600, color:d.direction==='up'?'#f87171':d.direction==='down'?'#34d399':'var(--text-3)' }}>{d.delta>0?'+':''}{d.delta.toFixed(4)}</td>
                    <td style={{ textAlign:'center' }}>{d.direction==='up'?<span style={{color:'#f87171'}}>↑</span>:d.direction==='down'?<span style={{color:'#34d399'}}>↓</span>:<span style={{color:'var(--text-3)'}}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(curveA.length>0||curveB.length>0)&&(
            <div className="card">
              <div className="card-header"><span className="card-title">Curve Overlay</span></div>
              <div className="card-body">
                <CurveChart series={[...(curveA.length>0?[{label:`A: ${result.deployment_a.Vector.ComplexityClass}`,color:'#a78bfa',curve:curveA}]:[]),...(curveB.length>0?[{label:`B: ${result.deployment_b.Vector.ComplexityClass}`,color:'#f87171',curve:curveB}]:[])]} />
              </div>
            </div>
          )}
          {result.sim_diff && (
            <>
              <div className="card anim-fade-in">
                <div className="card-header"><span className="card-title">Simulation Summary</span></div>
                <ul style={{ margin:0, padding:'10px 20px 14px', listStyle:'none', display:'flex', flexDirection:'column', gap:7 }}>
                  {result.sim_diff.summary.map((s,i)=><li key={i} style={{ fontSize:13, color:'var(--text-2)', fontFamily:'var(--font-geist-mono)', paddingLeft:14, borderLeft:'2px solid var(--border-mid)' }}>{s}</li>)}
                </ul>
                <div style={{ padding:'0 20px 16px', display:'flex', gap:24 }}>
                  {[
                    { label:'Success Rate', value:`${(result.sim_diff.success_rate_delta*100).toFixed(0)}%`, up: result.sim_diff.success_rate_delta < 0 },
                    { label:'Avg Turns', value:`${result.sim_diff.avg_turns_delta > 0 ? '+' : ''}${result.sim_diff.avg_turns_delta.toFixed(1)}`, up: result.sim_diff.avg_turns_delta > 0 },
                    { label:'Avg Latency', value:`${result.sim_diff.avg_latency_delta_ms > 0 ? '+' : ''}${result.sim_diff.avg_latency_delta_ms.toFixed(0)}ms`, up: result.sim_diff.avg_latency_delta_ms > 0 },
                  ].map(m => (
                    <div key={m.label} style={{ fontSize:12, fontFamily:'var(--font-geist-mono)' }}>
                      <div style={{ color:'var(--text-3)', marginBottom:2 }}>{m.label}</div>
                      <div style={{ fontWeight:700, color: Math.abs(parseFloat(m.value)) < 0.1 ? 'var(--text-2)' : m.up ? '#f87171' : '#4ade80' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {result.sim_diff.endpoint_deltas.length > 0 && (
                <div className="card anim-fade-in">
                  <div className="card-header"><span className="card-title">Endpoint Latency Heatmap</span></div>
                  <table className="data-table">
                    <thead><tr><th>Endpoint</th><th style={{textAlign:'right'}}>A (ms)</th><th style={{textAlign:'right'}}>B (ms)</th><th style={{textAlign:'right'}}>Delta</th><th style={{textAlign:'center',width:36}}/></tr></thead>
                    <tbody>
                      {result.sim_diff.endpoint_deltas.map((ep,i)=>(
                        <tr key={i}>
                          <td style={{ color:'var(--text)', fontFamily:'var(--font-geist-mono)' }}>{ep.endpoint}</td>
                          <td style={{ textAlign:'right', color:'var(--text-2)' }}>{ep.avg_latency_a_ms.toFixed(0)}</td>
                          <td style={{ textAlign:'right', color:'var(--text-2)' }}>{ep.avg_latency_b_ms.toFixed(0)}</td>
                          <td style={{ textAlign:'right', fontWeight:600, color:ep.direction==='up'?'#f87171':ep.direction==='down'?'#34d399':'var(--text-3)' }}>{ep.delta_ms>0?'+':''}{ep.delta_ms.toFixed(0)}ms</td>
                          <td style={{ textAlign:'center' }}>{ep.direction==='up'?<span style={{color:'#f87171'}}>↑</span>:ep.direction==='down'?<span style={{color:'#34d399'}}>↓</span>:<span style={{color:'var(--text-3)'}}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
