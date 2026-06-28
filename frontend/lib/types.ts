// Types mirroring Go backend structs exactly

export interface ProbePoint {
  N: number
  Concurrency: number
  P50: number
  P95: number
  P99: number
  Errors: number
}

export interface FingerprintVector {
  ComplexityClass: string
  ComplexityExponent: number
  MemoryGrowthRate: number
  ConcurrencyCliff: number
  BreakingPoint: number
  ReadWriteRatio: number
}

export interface FitResult {
  complexity_class: string
  exponent: number
  coefficient: number
  r_squared: number
  fitted_curve: [number, number][]
}

export interface ProbeResponse {
  sweep_points: ProbePoint[]
  fingerprint_vector: FingerprintVector
  fit_result: FitResult
  estimated_duration: string
}

export interface Deployment {
  ID: number
  Endpoint: string
  Version: string
  Notes: string
  CreatedAt: string
  Vector: FingerprintVector
  FittedCurveJSON: string
  SweepResultJSON: string
  HeadersJSON: string
  PayloadTemplate: string
  HTTPMethod: string
  Name: string
  Tag: string
  Mode: string
  SessionLogs: string
  Summary: string
}

export interface FieldDelta {
  field: string
  a: number
  b: number
  delta: number
  direction: 'up' | 'down' | 'same'
}

export interface EndpointDelta {
  endpoint: string
  avg_latency_a_ms: number
  avg_latency_b_ms: number
  delta_ms: number
  direction: 'up' | 'down' | 'same'
}

export interface SimDiff {
  success_rate_delta: number
  avg_turns_delta: number
  avg_latency_delta_ms: number
  endpoint_deltas: EndpointDelta[]
  summary: string[]
}

export interface DiffResponse {
  deployment_a: Deployment
  deployment_b: Deployment
  deltas: FieldDelta[]
  summary: string[]
  sim_diff?: SimDiff | null
}

export interface SimilarityResult extends Deployment {
  Score: number
}

export interface ProbeRequest {
  endpoint: string
  method: string
  payload_template?: string
  headers?: Record<string, string>
  input_sizes?: number[]
  concurrency_levels?: number[]
  warmup_rounds?: number
  samples_per_step?: number
  timeout_ms?: number
}

export interface SaveDeploymentRequest {
  endpoint: string
  version: string
  notes?: string
  fingerprint_vector: FingerprintVector
  fitted_curve?: string
  sweep_result?: string
  headers_json?: string
  payload_template?: string
  http_method?: string
  name: string
  tag?: string
  mode?: string
  session_logs?: string
  summary?: string
}

// ── Stress Test ────────────────────────────────────────────────────────────

export interface StressRequest {
  endpoint: string
  method: string
  headers?: Record<string, string>
  body?: string
  concurrency_steps: number[]
  timeout_ms?: number
}

export interface StressStep {
  concurrency: number
  p50: number
  p95: number
  p99: number
  error_rate: number
  errors: number
  total: number
}

export type StressEvent =
  | ({ type: 'step' } & StressStep)
  | { type: 'breaking_point'; concurrency: number; error_rate: number }
  | { type: 'done'; steps_completed: number }
  | { type: 'error'; message: string }

// ── Simulation / Agent ─────────────────────────────────────────────────────

export interface SpecEndpoint {
  method: string
  path: string
  description: string
}

export interface SpecValidateResponse {
  valid: boolean
  spec_title: string
  endpoints: SpecEndpoint[]
  auth_detected: string
  warnings: string[]
  error: string
}

export interface AgentPlan {
  agent_id: number
  persona: string
  tone: string
  input_slice: string
  action_plan: string[]
  success_condition: string
}

export interface AgentPlanResponse {
  plans: AgentPlan[]
  spec_title: string
  validation_errors: string[]
}

export interface AgentRunResponse {
  session_group_id: string
}

export type AgentEvent =
  | { session_id: number; type: 'request'; method: string; url: string; body?: unknown; turn: number; t: number }
  | { session_id: number; type: 'response'; status_code: number; body: string; latency_ms: number; error: string; turn: number }
  | { session_id: number; type: 'reasoning'; text: string; turn: number }
  | { session_id: number; type: 'done'; success: boolean; turns: number; reason: string }
  | { type: 'group_done'; success_count: number; fail_count: number; total_turns: number }
  | { type: 'error'; message: string }
