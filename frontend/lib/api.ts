import type {
  ProbeRequest,
  ProbeResponse,
  Deployment,
  SaveDeploymentRequest,
  DiffResponse,
  SimilarityResult,
  FingerprintVector,
} from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

export const api = {
  probe: (body: ProbeRequest) =>
    request<ProbeResponse>('/api/probe', { method: 'POST', body: JSON.stringify(body) }),

  saveDeployment: (body: SaveDeploymentRequest) =>
    request<{ id: number }>('/api/deployments', { method: 'POST', body: JSON.stringify(body) }),

  listDeployments: (endpoint?: string) =>
    request<Deployment[]>(`/api/deployments${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`),

  getDeployment: (id: number) =>
    request<Deployment>(`/api/deployments/${id}`),

  diff: (a: number, b: number) =>
    request<DiffResponse>(`/api/diff?a=${a}&b=${b}`),

  timeline: (endpoint: string) =>
    request<Deployment[]>(`/api/timeline?endpoint=${encodeURIComponent(endpoint)}`),

  search: (vector: FingerprintVector) =>
    request<SimilarityResult[]>('/api/search', {
      method: 'POST',
      body: JSON.stringify({ fingerprint_vector: vector }),
    }),
}
