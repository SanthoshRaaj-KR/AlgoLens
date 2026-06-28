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
}

export interface FieldDelta {
  field: string
  a: number
  b: number
  delta: number
  direction: 'up' | 'down' | 'same'
}

export interface DiffResponse {
  deployment_a: Deployment
  deployment_b: Deployment
  deltas: FieldDelta[]
  summary: string[]
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
}
