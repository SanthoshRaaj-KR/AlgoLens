# Phase 8 — React Frontend Revamp

## Status
**Partially done.** The existing frontend has all 6 pages and components for the original fingerprinting tool. This phase adds 2 new pages (Stress Test, Simulation), updates the sidebar for 4-mode navigation, and extends the Diff and Deployments pages for new data. Existing components are reused as-is wherever possible.

---

## Goal
Give AlgoLens a clean 4-mode UI where every mode is fully usable end-to-end: stress test with live curve, simulation with live agent panels, deployment comparison with heatmap, and similarity search.

---

## What's Already Done (Reuse)

| What | Where | Reuse plan |
|---|---|---|
| `CurveChart` | `frontend/src/components/curve-chart.tsx` | Reuse for stress test latency curve (same props) |
| `FingerprintCard` | `frontend/src/components/fingerprint-card.tsx` | Keep on probe page, unchanged |
| `ComplexityBadge` | `frontend/src/components/complexity-badge.tsx` | Keep everywhere complexity class is shown |
| `SweepTable` | `frontend/src/components/sweep-table.tsx` | Keep on probe/detail pages, unchanged |
| `DriftChart` | `frontend/src/components/drift-chart.tsx` | Keep on timeline page, unchanged |
| `FitResultCard` | `frontend/src/components/fit-result-card.tsx` | Keep on probe page, unchanged |
| `api.ts` client | `frontend/src/lib/api.ts` | Extend — add new endpoint calls, keep existing ones |
| `types.ts` | `frontend/src/lib/types.ts` | Extend — add new types, keep existing ones |
| Dashboard page | `frontend/src/app/page.tsx` | Minor update: add `name` column to deployment table |
| Search page | `frontend/src/app/search/page.tsx` | No changes needed |
| Timeline page | `frontend/src/app/timeline/page.tsx` | No changes needed |
| Deployment detail page | `frontend/src/app/deployments/[id]/page.tsx` | Minor update: show `name`, `tag`, `mode` |

---

## What to Build

### New: SSE hook (`frontend/src/hooks/useSSE.ts`)

```typescript
export function useSSE(url: string | null) {
  // Connects to SSE URL, parses JSON events, stores in state array
  // Returns: { events: SseEvent[], status: 'connecting'|'open'|'closed'|'error' }
  // Reconnects automatically on disconnect (with last event index)
  // Disconnects when url becomes null
  // Used by both: stress test page (stress events) and simulation page (agent events)
}
```

### New: Stress Test page (`frontend/src/app/stress/page.tsx`)

Layout:
```
┌─────────────────────────────────────────┐
│ Endpoint URL       [___________________] │
│ Method  [GET▼]    Headers [+ Add Row]   │
│ Body    [____________________________]   │
│ Concurrency Steps  [1, 5, 10, 25, 50]   │
│ Timeout (ms)       [5000]               │
│                          [Run Stress Test]│
├─────────────────────────────────────────┤
│ Live Latency Curve (Recharts)           │
│  p50 ── p95 ── p99                     │
│  x-axis: concurrency, y-axis: ms       │
├─────────────────────────────────────────┤
│ Breaking Point: ⚠️ at concurrency=50   │
│ Steps: 4/6 complete                    │
├─────────────────────────────────────────┤
│              [Save as Deployment]        │
└─────────────────────────────────────────┘
```

Behaviour:
- "Run" button → disabled until endpoint URL filled
- On click: connects to `POST /api/stress` SSE stream
- Each SSE `step` event: adds a point to the Recharts `LineChart` (3 lines: p50/p95/p99)
- `breaking_point` event: shows a red banner "Breaking point detected at concurrency X"
- `done` event: shows "Save as Deployment" button
- Save modal: requires `name` field, optional `tag` and `notes`

### New: Simulation page (`frontend/src/app/simulation/page.tsx`)

Three-step flow on one page:

**Step 1 — Configure**
```
Swagger Spec URL  [https://...]       [Validate]
Base URL          [https://...]
Headers           [+ Add Row]
Goal              [Test the full checkout flow]
Number of Agents  [4]
                  [Generate Plans]  ← disabled until Validate passes
```

**Step 2 — Review Plans** (shown after /agent/plan returns)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Agent 1      │ │ Agent 2      │ │ Agent 3      │ │ Agent 4      │
│ Power User   │ │ Casual User  │ │ Adversarial  │ │ First-Timer  │
│              │ │              │ │              │ │              │
│ Input slice: │ │ Input slice: │ │ Input slice: │ │ Input slice: │
│ large payload│ │ minimal req  │ │ edge cases   │ │ wrong order  │
│              │ │              │ │              │ │              │
│ Plan:        │ │ Plan:        │ │ Plan:        │ │ Plan:        │
│ 1. POST /login│ │ 1. POST /login│ │ 1. POST /login│ │ 1. GET /items│
│ 2. POST /search│ │ 2. GET /items│ │ 2. POST /search│ │ (wrong first)│
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

                    [Run Simulation]
```

**Step 3 — Live Execution** (after /agent/run starts)

Agent panels dropdown:
```
View: [All Agents ▼]   ← dropdown: "All" | "Agent 1" | "Agent 2" | ...

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Agent 1 ✅      │ │ Agent 2 🔄      │ │ Agent 3 🔄      │ │ Agent 4 ❌      │
│ Power User      │ │ Casual User     │ │ Adversarial     │ │ First-Timer     │
│ Turn 5/? Done   │ │ Turn 3/? ...    │ │ Turn 2/? ...    │ │ Turn 4 Failed   │
│─────────────────│ │─────────────────│ │─────────────────│ │─────────────────│
│ > POST /login   │ │ > POST /login   │ │ > POST /login   │ │ > GET /items    │
│ < 200 43ms      │ │ < 200 41ms      │ │ < 200 39ms      │ │ < 401 12ms      │
│ 💭 Got token,   │ │ 💭 Logged in,   │ │ 💭 Will try     │ │ 💭 Got 401,     │
│   searching...  │ │   getting items │ │   empty string  │ │   need auth     │
│ > POST /search  │ │ > GET /items    │ │ > POST /search  │ │ > POST /login   │
│ < 200 156ms     │ │ (waiting...)    │ │ (waiting...)    │ │ (waiting...)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘

[Save as Deployment]  ← shown after group_done event
```

When "All Agents" dropdown changed to "Agent 2": shows agent 2 panel full-width, others hidden.

### New: Agent Panel component (`frontend/src/components/agent-panel.tsx`)

Props: `{ agentId, persona, events: SseEvent[], status: 'running'|'done'|'failed' }`

Renders:
- Header: agent number, persona badge, turn counter, status icon
- Scrolling event list:
  - `request` event → `> METHOD /path` in blue
  - `response` event → `< STATUS Xms` in green (2xx) or red (4xx/5xx)  
  - `reasoning` event → `💭 text` in grey italic
- Auto-scrolls to bottom as new events arrive

### Updated: Sidebar (`frontend/src/components/sidebar.tsx`)

New nav items (replace existing or extend):
```
🔬 Stress Test      → /stress
🤖 Simulation       → /simulation
📊 Fingerprint      → /probe       (existing, renamed)
🔍 Compare          → /diff        (existing)
📈 Timeline         → /timeline    (existing)
🔎 Search           → /search      (existing)
```

### Updated: api.ts (`frontend/src/lib/api.ts`)

Add:
```typescript
stressTest(body: StressRequest): string   // returns SSE URL (not a fetch — caller passes to useSSE)
validateSpec(body: SpecValidateRequest): Promise<SpecValidateResponse>
generatePlans(body: PlanRequest): Promise<PlanResponse>
runSimulation(body: RunRequest): Promise<{session_group_id: string}>
agentStream(sessionGroupId: string): string  // returns SSE URL
```

### Updated: types.ts (`frontend/src/lib/types.ts`)

Add:
```typescript
interface StressStep { concurrency: number; p50: number; p95: number; p99: number; error_rate: number }
interface SseEvent   { type: string; session_id?: number; [key: string]: any }
interface AgentPlan  { agent_id: number; persona: string; tone: string; input_slice: string; action_plan: string[]; success_condition: string }
interface SimDiff    { success_rate_delta: number; avg_turns_delta: number; endpoint_deltas: EndpointDelta[]; summary: string[] }
```

Update `Deployment` interface to include `name`, `tag`, `mode` fields.
Update `DiffResponse` to include `sim_diff?: SimDiff`.

### Updated: Save modal (used across pages)

The save modal (currently inline in probe page) needs `name` (required text input) and `tag` (optional) fields added. Extract into a shared `SaveDeploymentModal` component if not already shared.

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `frontend/src/hooks/useSSE.ts` | **Create** | SSE hook for both stress + simulation |
| `frontend/src/app/stress/page.tsx` | **Create** | Stress test page (form + live curve + save) |
| `frontend/src/app/simulation/page.tsx` | **Create** | Simulation page (3-step flow + live panels) |
| `frontend/src/components/agent-panel.tsx` | **Create** | Single agent live event panel |
| `frontend/src/components/sidebar.tsx` | **Modify** | Add Stress Test + Simulation nav items |
| `frontend/src/lib/api.ts` | **Modify** | Add new API calls |
| `frontend/src/lib/types.ts` | **Modify** | Add new types, update Deployment + DiffResponse |
| `frontend/src/app/page.tsx` | **Modify** | Add `name` column to deployment table |
| `frontend/src/app/diff/page.tsx` | **Modify** | Add sim_diff section (heatmap + sim summary) |
| `frontend/src/app/deployments/[id]/page.tsx` | **Modify** | Show `name`, `tag`, `mode` |
| `frontend/src/app/probe/page.tsx` | **Modify** | Add `name` + `tag` to save modal |

---

## How It Connects

- **Receives from Phase 1**: `POST /api/stress` SSE stream
- **Receives from Phase 4**: `POST /agent/spec/validate` and `POST /agent/spec/load`
- **Receives from Phase 5**: `POST /agent/plan`
- **Receives from Phase 6**: `POST /agent/run` and `GET /agent/stream/{id}`
- **Receives from Phase 7**: Extended `GET /api/diff` with `sim_diff`

---

## Exit Criterion

Full demo run without any console errors:
1. Fill stress test form → run → live curve builds point by point → breaking point banner appears → save with name "stress-baseline"
2. Paste Petstore spec → validate → "Validate" shows endpoint list → enter goal → generate plans → 4 plan cards appear → click Run Simulation → 4 live panels populate with events → all agents finish → save with name "petstore-sim-v1"
3. Compare page: select "stress-baseline" and a second stress deployment → diff shows curve overlay + deltas
4. Compare page: select two simulation deployments → diff shows sim_diff section with endpoint heatmap
