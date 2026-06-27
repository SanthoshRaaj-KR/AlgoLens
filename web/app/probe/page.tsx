'use client'
import { useState } from 'react'
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

function parseInts(s: string): number[] {
  return s.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n))
}

export default function ProbePage() {
  const [form, setForm] = useState(DEFAULTS)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ProbeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Save modal state
  const [showSave, setShowSave] = useState(false)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    setSavedId(null)
    try {
      const res = await api.probe({
        endpoint: form.endpoint,
        method: form.method,
        payload_template: form.payload_template || undefined,
        input_sizes: parseInts(form.input_sizes),
        concurrency_levels: parseInts(form.concurrency_levels),
        warmup_rounds: Number(form.warmup_rounds),
        samples_per_step: Number(form.samples_per_step),
        timeout_ms: Number(form.timeout_ms),
      })
      setResult(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
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
      })
      setSavedId(id)
      setShowSave(false)
      setVersion('')
      setNotes('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-base font-mono font-semibold text-zinc-900">Run Probe</h1>

      {/* Config Form */}
      <div className="border border-zinc-200 rounded-lg overflow-hidden">
        <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
          <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Probe Config</span>
        </div>
        <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-mono text-zinc-500 mb-1">Endpoint URL (use {'{{n}}'} as placeholder)</label>
            <input
              value={form.endpoint}
              onChange={f('endpoint')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
              placeholder="http://localhost:9000/search?limit={{n}}"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Method</label>
            <input
              value={form.method}
              onChange={f('method')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Payload template (POST only)</label>
            <input
              value={form.payload_template}
              onChange={f('payload_template')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
              placeholder={`{"limit":{{n}}}`}
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Input sizes (comma-separated)</label>
            <input
              value={form.input_sizes}
              onChange={f('input_sizes')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Concurrency levels (comma-separated)</label>
            <input
              value={form.concurrency_levels}
              onChange={f('concurrency_levels')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Warmup rounds</label>
            <input
              type="number"
              value={form.warmup_rounds}
              onChange={f('warmup_rounds')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Samples per step</label>
            <input
              type="number"
              value={form.samples_per_step}
              onChange={f('samples_per_step')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-zinc-500 mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={form.timeout_ms}
              onChange={f('timeout_ms')}
              className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={run}
            disabled={running}
            className="px-4 py-2 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Running sweep…' : 'Run Probe'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Header + estimated duration */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-zinc-500">
              {result.sweep_points.length} probe points · estimated {result.estimated_duration}
            </div>
            <div className="flex items-center gap-2">
              {savedId !== null && (
                <span className="text-xs font-mono text-green-600">Saved as deployment #{savedId}</span>
              )}
              <button
                onClick={() => setShowSave(true)}
                className="px-3 py-1.5 text-xs font-mono border border-zinc-200 rounded hover:border-zinc-400 text-zinc-700"
              >
                Save as Deployment
              </button>
            </div>
          </div>

          {/* Fingerprint + Fit side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FingerprintCard v={result.fingerprint_vector} />
            <FitResultCard fit={result.fit_result} />
          </div>

          {/* Fitted curve chart */}
          {result.fit_result.fitted_curve?.length > 0 && (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
                <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Fitted Curve</span>
              </div>
              <div className="p-4">
                <CurveChart series={[{
                  label: result.fingerprint_vector.ComplexityClass,
                  color: '#18181b',
                  curve: result.fit_result.fitted_curve,
                }]} />
              </div>
            </div>
          )}

          {/* Sweep table */}
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200">
              <span className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-wide">Latency Matrix</span>
            </div>
            <div className="p-4">
              <SweepTable points={result.sweep_points} />
            </div>
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSave && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-zinc-200 p-6 w-full max-w-sm space-y-4">
            <h2 className="text-sm font-mono font-semibold text-zinc-900">Save Deployment</h2>
            <div>
              <label className="block text-xs font-mono text-zinc-500 mb-1">Version tag *</label>
              <input
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
                placeholder="v1.2.0"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-zinc-500 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-zinc-200 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-zinc-400"
                placeholder="baseline after refactor"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSave(false)}
                className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !version.trim()}
                className="px-3 py-1.5 text-xs font-mono bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
