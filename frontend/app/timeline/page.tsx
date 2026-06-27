'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { Deployment } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import { DriftChart } from '@/components/drift-chart'

export default function TimelinePage() {
  const [endpoint, setEndpoint] = useState('')
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<Deployment[]|null>(null)
  const [error, setError] = useState<string|null>(null)

  async function run() {
    if(!endpoint.trim()) return; setLoading(true); setError(null)
    try { setList(await api.timeline(endpoint.trim())) } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }

  return (
    <div className="anim-fade-up" style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div>
        <h1 style={{ fontSize:28, fontWeight:700, color:'var(--text)', letterSpacing:'-0.03em', margin:0 }}>Timeline</h1>
        <p style={{ margin:'6px 0 0', fontSize:13, color:'var(--text-3)', fontFamily:'var(--font-geist-mono)' }}>Track complexity drift across versions for a specific endpoint</p>
      </div>
      <div className="card">
        <div className="card-body" style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
          <div style={{flex:1}}><label className="input-label">Endpoint URL</label><input value={endpoint} onChange={e=>setEndpoint(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} className="input" placeholder="http://api.example.com/search" /></div>
          <button onClick={run} disabled={loading||!endpoint.trim()} className="btn-primary">{loading?<><span className="spinner"/>Loading…</>:'Load'}</button>
        </div>
      </div>
      {error && <div className="error-box anim-fade-in">{error}</div>}
      {list && list.length===0 && <div className="card"><div className="empty-state"><div className="empty-icon">∿</div><div className="empty-title">No results</div><div className="empty-sub">No deployments found for this endpoint URL.</div></div></div>}
      {list && list.length>0 && (
        <div className="anim-fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Complexity Drift</span><span style={{fontSize:12,color:'var(--text-3)',fontFamily:'var(--font-geist-mono)'}}>{list.length} version{list.length!==1?'s':''}</span></div>
            <div className="card-body"><DriftChart deployments={list}/></div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Version History</span></div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Version</th><th>Complexity</th><th>Exponent</th><th>Mem Growth</th><th>Cliff</th><th>Breaking</th><th>Notes</th></tr></thead>
              <tbody>
                {list.map(d=>(
                  <tr key={d.ID}>
                    <td style={{color:'var(--text-3)',whiteSpace:'nowrap'}}>{new Date(d.CreatedAt).toLocaleString()}</td>
                    <td style={{color:'var(--accent-light)',fontWeight:600}}>{d.Version}</td>
                    <td><ComplexityBadge cls={d.Vector.ComplexityClass}/></td>
                    <td style={{color:'var(--text-2)'}}>{d.Vector.ComplexityExponent.toFixed(3)}</td>
                    <td style={{color:'var(--text-2)'}}>{d.Vector.MemoryGrowthRate.toFixed(4)}</td>
                    <td style={{color:d.Vector.ConcurrencyCliff===0?'var(--border-mid)':'#fbbf24'}}>{d.Vector.ConcurrencyCliff===0?'—':d.Vector.ConcurrencyCliff}</td>
                    <td style={{color:d.Vector.BreakingPoint===0?'var(--border-mid)':'#f87171'}}>{d.Vector.BreakingPoint===0?'—':d.Vector.BreakingPoint}</td>
                    <td style={{color:'var(--text-3)',fontStyle:d.Notes?'normal':'italic'}}>{d.Notes||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
