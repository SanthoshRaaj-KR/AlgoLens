import type {
  ProbeRequest, ProbeResponse, Deployment, SaveDeploymentRequest,
  DiffResponse, SimilarityResult, FingerprintVector,
  StressRequest, StressEvent, SpecValidateResponse,
  AgentPlanResponse, AgentRunResponse,
} from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const PY_BASE = process.env.NEXT_PUBLIC_PY_URL ?? 'http://localhost:8001'

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? json.detail ?? `HTTP ${res.status}`)
  return json as T
}

export async function* streamStress(body: StressRequest): AsyncGenerator<StressEvent> {
  const res = await fetch(`${BASE}/api/stress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) { const t = await res.text(); throw new Error(t) }
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      try { yield JSON.parse(line.slice(6)) as StressEvent } catch { /* skip */ }
    }
  }
}

export function agentStreamURL(sessionGroupId: string): string {
  return `${PY_BASE}/agent/stream/${sessionGroupId}`
}

export const api = {
  probe: (body: ProbeRequest) =>
    request<ProbeResponse>(BASE, '/api/probe', { method: 'POST', body: JSON.stringify(body) }),

  saveDeployment: (body: SaveDeploymentRequest) =>
    request<{ id: number }>(BASE, '/api/deployments', { method: 'POST', body: JSON.stringify(body) }),

  listDeployments: (endpoint?: string) =>
    request<Deployment[]>(BASE, `/api/deployments${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`),

  getDeployment: (id: number) =>
    request<Deployment>(BASE, `/api/deployments/${id}`),

  diff: (a: number, b: number) =>
    request<DiffResponse>(BASE, `/api/diff?a=${a}&b=${b}`),

  timeline: (endpoint: string) =>
    request<Deployment[]>(BASE, `/api/timeline?endpoint=${encodeURIComponent(endpoint)}`),

  search: (vector: FingerprintVector) =>
    request<SimilarityResult[]>(BASE, '/api/search', {
      method: 'POST',
      body: JSON.stringify({ fingerprint_vector: vector }),
    }),

  specValidate: (spec_url: string, base_url: string, headers: Record<string, string>) =>
    request<SpecValidateResponse>(PY_BASE, '/agent/spec/validate', {
      method: 'POST',
      body: JSON.stringify({ spec_url, base_url, headers }),
    }),

  agentPlan: (spec_url: string, goal: string, n_agents: number) =>
    request<AgentPlanResponse>(PY_BASE, '/agent/plan', {
      method: 'POST',
      body: JSON.stringify({ spec_url, goal, n_agents }),
    }),

  agentRun: (spec_url: string, plans: unknown[], base_url: string, headers: Record<string, string>, goal: string, name: string, tag: string) =>
    request<AgentRunResponse>(PY_BASE, '/agent/run', {
      method: 'POST',
      body: JSON.stringify({ spec_url, plans, base_url, headers, goal, name, tag }),
    }),
}
