'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { SimilarityResult, FingerprintVector } from '@/lib/types'
import { ComplexityBadge } from '@/components/complexity-badge'
import Link from 'next/link'
import { useToast } from '@/components/toast'

const EMPTY: FingerprintVector = { ComplexityClass:'O(n)', ComplexityExponent:1.0, MemoryGrowthRate:0, ConcurrencyCliff:0, BreakingPoint:0, ReadWriteRatio:0.5 }
const FIELDS: {key:keyof FingerprintVector;label:string;type:string}[] = [
  {key:'ComplexityClass',label:'Complexity Class',type:'text'},{key:'ComplexityExponent',label:'Complexity Exponent',type:'number'},
  {key:'MemoryGrowthRate',label:'Memory Growth Rate',type:'number'},{key:'ConcurrencyCliff',label:'Concurrency Cliff',type:'number'},
  {key:'BreakingPoint',label:'Breaking Point',type:'number'},{key:'ReadWriteRatio',label:'Read / Write Ratio',type:'number'},
]

function scoreStyle(s:number): React.CSSProperties {
  if(s>=0.9) return {color:'#f87171',fontWeight:700}
  if(s>=0.7) return {color:'#fbbf24',fontWeight:700}
  return {color:'#34d399',fontWeight:700}
}

export default function SearchPage() {
  const { toast } = useToast()
  const [vec, setVec] = useState<FingerprintVector>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [loadingLatest, setLoadingLatest] = useState(false)
  const [results, setResults] = useState<SimilarityResult[]|null>(null)

  const setField = (k:keyof FingerprintVector) => (e:React.ChangeEvent<HTMLInputElement>) => setVec(p=>({...p,[k]:k==='ComplexityClass'?e.target.value:parseFloat(e.target.value)}))

  async function run() {
    setLoading(true)
    try { setResults(await api.search(vec)) } catch(e) { toast((e as Error).message) } finally { setLoading(false) }
  }

  async function useLatest() {
    setLoadingLatest(true)
    try {
      const all = await api.listDeployments()
      if (!all.length) { toast('No deployments saved yet', 'warning'); return }
      const d = all[0]
      setVec(d.Vector)
      toast(`Loaded vector from "${d.Name || `#${d.ID}`}"`, 'success')
    } catch(e) { toast((e as Error).message) } finally { setLoadingLatest(false) }
  }

  return (
    <div className="anim-fade-up" style={{ display:'flex', flexDirection:'column', gap:28 }}>
      <div>
        <h1 style={{ fontSize:28, fontWeight:700, color:'var(--text)', letterSpacing:'-0.03em', margin:0 }}>Similarity Search</h1>
        <p style={{ margin:'6px 0 0', fontSize:13, color:'var(--text-3)', fontFamily:'var(--font-geist-mono)' }}>Find saved deployments with similar fingerprint vectors using cosine similarity</p>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Query Vector</span>
          <button onClick={useLatest} disabled={loadingLatest} className="btn-secondary" style={{ fontSize:11, padding:'5px 12px' }}>
            {loadingLatest ? <><span className="spinner"/>Loading…</> : 'Use latest run'}
          </button>
        </div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          {FIELDS.map(({key,label,type})=>(
            <div key={key}><label className="input-label">{label}</label><input type={type} step="any" value={String(vec[key])} onChange={setField(key)} className="input" /></div>
          ))}
        </div>
        <div style={{padding:'0 20px 20px'}}><button onClick={run} disabled={loading} className="btn-primary">{loading?<><span className="spinner"/>Searching…</>:'Search'}</button></div>
      </div>
      {loading && (
        <div className="card anim-fade-in">
          <div className="card-header"><span className="card-title">Results</span></div>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ display:'flex', gap:16, alignItems:'center' }}>
                <div className="skeleton" style={{ height:14, width:48, flexShrink:0 }} />
                <div className="skeleton" style={{ height:14, flex:1 }} />
                <div className="skeleton" style={{ height:14, width:80, flexShrink:0 }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && results && results.length===0 && <div className="card"><div className="empty-state"><div className="empty-icon">◎</div><div className="empty-title">No deployments to compare</div><div className="empty-sub">Save a probe result first, then search for similar ones.</div></div></div>}
      {!loading && results && results.length>0 && (
        <div className="card anim-fade-up">
          <div className="card-header"><span className="card-title">Results</span><span style={{fontSize:12,color:'var(--text-3)',fontFamily:'var(--font-geist-mono)'}}>{results.length} found</span></div>
          <table className="data-table">
            <thead><tr><th>Score</th><th style={{width:48}}>#</th><th>Endpoint</th><th>Version</th><th>Complexity</th><th>Exponent</th><th>Date</th><th style={{width:64}}/></tr></thead>
            <tbody>
              {results.map((r,i)=>(
                <tr key={r.ID} style={{background:i===0?'rgba(124,58,237,0.06)':undefined}}>
                  <td style={scoreStyle(r.Score)}>{(r.Score*100).toFixed(1)}%</td>
                  <td style={{color:'var(--text-3)'}}>{r.ID}</td>
                  <td style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text)'}} title={r.Endpoint}>{r.Endpoint}</td>
                  <td style={{color:'var(--text-2)'}}>{r.Version}</td>
                  <td><ComplexityBadge cls={r.Vector.ComplexityClass}/></td>
                  <td style={{color:'var(--text-2)'}}>{r.Vector.ComplexityExponent.toFixed(3)}</td>
                  <td style={{color:'var(--text-3)'}}>{new Date(r.CreatedAt).toLocaleDateString()}</td>
                  <td><Link href={`/deployments/${r.ID}`} style={{color:'var(--accent-light)',textDecoration:'none',fontSize:12}}>view →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
