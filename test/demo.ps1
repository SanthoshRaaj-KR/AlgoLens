# AlgoLens end-to-end demo
# Probes test endpoints with known complexity, saves, diffs, searches.
#
# Before running this script, start all three services:
#   Terminal 1 (Python sidecar): cd python && .\.venv\Scripts\Activate.ps1 && uvicorn main:app --port 8001 --reload
#   Terminal 2 (Go API server) : cd go    && go run ./cmd/server
#   Terminal 3 (Test server)   : cd go    && go run ./test/server
#
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File test\demo.ps1

$ErrorActionPreference = "Stop"
$base    = "http://localhost:8080"
$sidecar = "http://localhost:8001"
$test    = "http://localhost:9000"

function Step($msg) { Write-Host "" ; Write-Host "==> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function FAIL($msg) { Write-Host "    ERR $msg" -ForegroundColor Red ; exit 1 }

# ── 0. Health checks ──────────────────────────────────────────────────────────
Step "Checking all three services are up"

try   { $r = Invoke-RestMethod "$sidecar/health" ; OK "Python sidecar: $($r.status)" }
catch { FAIL "Python sidecar not reachable. Start: cd python && uvicorn main:app --port 8001" }

try   { $r = Invoke-RestMethod "$base/health" ; OK "Go API server:  $($r.status)" }
catch { FAIL "Go server not reachable. Start: cd go && go run ./cmd/server" }

try   { $r = Invoke-RestMethod "$test/health" ; OK "Test server:    $($r.status)" }
catch { FAIL "Test server not reachable. Start: cd go && go run ./test/server" }

# ── 1. Probe O(1) endpoint ────────────────────────────────────────────────────
Step "Probing O(1) endpoint -- /constant (expect ~1ms flat across all n)"

$body = ConvertTo-Json @{
    endpoint           = "$test/constant?n={{n}}"
    method             = "GET"
    input_sizes        = @(1,2,4,8,16,32)
    concurrency_levels = @(1,2)
    warmup_rounds      = 1
    samples_per_step   = 5
    step_warmup        = 0
    timeout_ms         = 3000
}

$probe1 = Invoke-RestMethod -Method Post -Uri "$base/api/probe" -Body $body -ContentType "application/json"
OK "Detected: $($probe1.fit_result.complexity_class)  R2=$([math]::Round($probe1.fit_result.r_squared, 3))"
Write-Host "    P50s at concurrency=1:" -ForegroundColor DarkGray
$probe1.sweep_points | Where-Object { $_.Concurrency -eq 1 } | ForEach-Object {
    Write-Host ("      n={0,-4} p50={1:F2}ms  p99={2:F2}ms" -f $_.N, $_.P50, $_.P99) -ForegroundColor DarkGray
}

# ── 2. Save O(1) as deployment v1 ─────────────────────────────────────────────
Step "Saving O(1) result as deployment v1"

$save1 = ConvertTo-Json @{
    endpoint           = "$test/constant"
    version            = "v1.0"
    notes              = "baseline - O(1) constant endpoint"
    fingerprint_vector = $probe1.fingerprint_vector
    fitted_curve       = (ConvertTo-Json $probe1.fit_result.fitted_curve -Compress)
    sweep_result       = (ConvertTo-Json $probe1.sweep_points -Compress)
}

$saved1 = Invoke-RestMethod -Method Post -Uri "$base/api/deployments" -Body $save1 -ContentType "application/json"
$id1 = $saved1.id
OK "Saved as ID $id1"

# ── 3. Probe O(n^2) endpoint ──────────────────────────────────────────────────
Step "Probing O(n^2) endpoint -- /quadratic (simulated regression)"

$body2 = ConvertTo-Json @{
    endpoint           = "$test/quadratic?n={{n}}"
    method             = "GET"
    input_sizes        = @(1,2,4,8,16,32)
    concurrency_levels = @(1,2)
    warmup_rounds      = 1
    samples_per_step   = 5
    step_warmup        = 0
    timeout_ms         = 5000
}

$probe2 = Invoke-RestMethod -Method Post -Uri "$base/api/probe" -Body $body2 -ContentType "application/json"
OK "Detected: $($probe2.fit_result.complexity_class)  R2=$([math]::Round($probe2.fit_result.r_squared, 3))"
Write-Host "    P50s at concurrency=1:" -ForegroundColor DarkGray
$probe2.sweep_points | Where-Object { $_.Concurrency -eq 1 } | ForEach-Object {
    Write-Host ("      n={0,-4} p50={1:F2}ms  p99={2:F2}ms" -f $_.N, $_.P50, $_.P99) -ForegroundColor DarkGray
}

# ── 4. Save O(n^2) as deployment v2 ───────────────────────────────────────────
Step "Saving O(n^2) result as deployment v2"

$save2 = ConvertTo-Json @{
    endpoint           = "$test/constant"
    version            = "v2.0"
    notes              = "regression - algorithm changed to O(n^2)"
    fingerprint_vector = $probe2.fingerprint_vector
    fitted_curve       = (ConvertTo-Json $probe2.fit_result.fitted_curve -Compress)
    sweep_result       = (ConvertTo-Json $probe2.sweep_points -Compress)
}

$saved2 = Invoke-RestMethod -Method Post -Uri "$base/api/deployments" -Body $save2 -ContentType "application/json"
$id2 = $saved2.id
OK "Saved as ID $id2"

# ── 5. Diff v1 vs v2 ──────────────────────────────────────────────────────────
Step "Diffing v1 (ID=$id1) vs v2 (ID=$id2) -- should detect regression"

$diff = Invoke-RestMethod "$base/api/diff?a=$id1&b=$id2"

Write-Host "    Regression summary:" -ForegroundColor Yellow
$diff.summary | ForEach-Object { Write-Host "      - $_" }

Write-Host "    Field deltas:" -ForegroundColor Yellow
$diff.deltas | ForEach-Object {
    Write-Host ("      {0,-24} {1} -> {2}  [{3}]" -f $_.field, $_.a, $_.b, $_.direction)
}

# ── 6. Timeline ───────────────────────────────────────────────────────────────
Step "Timeline for endpoint (oldest first)"

$timeline = Invoke-RestMethod "$base/api/timeline?endpoint=$test/constant"
$timeline | ForEach-Object {
    Write-Host ("      [ID={0}] {1}  class={2}  exponent={3}" -f `
        $_.ID, $_.Version, $_.Vector.ComplexityClass, $_.Vector.ComplexityExponent)
}
OK "$($timeline.Count) entries, IDs should be ascending (chronological)"

# ── 7. Similarity search ──────────────────────────────────────────────────────
Step "Similarity search: find deployments similar to the O(n^2) fingerprint"

$searchBody = ConvertTo-Json @{
    fingerprint_vector = $probe2.fingerprint_vector
}

$results = Invoke-RestMethod -Method Post -Uri "$base/api/search" -Body $searchBody -ContentType "application/json"
$results | ForEach-Object {
    # similarityResult embeds store.Deployment, so fields are at the top level (no .deployment wrapper)
    Write-Host ("      score={0:F3}  [ID={1}] {2}  class={3}" -f `
        $_.score, $_.ID, $_.Version, $_.Vector.ComplexityClass)
}
OK "v2 should score ~1.0, v1 should score much lower"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Demo complete." -ForegroundColor Green
