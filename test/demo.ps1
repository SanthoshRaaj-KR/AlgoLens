# AlgoLens end-to-end demo script
# Probes endpoints with known complexity, saves deployments, diffs, searches.
#
# Prerequisites (must already be running):
#   Terminal 1: cd python && .\.venv\Scripts\Activate.ps1 && uvicorn main:app --port 8001 --reload
#   Terminal 2: cd go    && go run ./cmd/server
#   Terminal 3: cd go    && go run ./test/server
#
# Run this script from any directory:
#   powershell -ExecutionPolicy Bypass -File test\demo.ps1

$ErrorActionPreference = "Stop"
$base    = "http://localhost:8080"
$sidecar = "http://localhost:8001"
$test    = "http://localhost:9000"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function FAIL($msg) { Write-Host "    ERR $msg" -ForegroundColor Red; exit 1 }

# ── 0. Health checks ──────────────────────────────────────────────────────────
Step "Checking all three services are up"

try { $r = Invoke-RestMethod "$sidecar/health"; OK "Python sidecar: $($r.status)" }
catch { FAIL "Python sidecar not reachable. Start it first." }

try { $r = Invoke-RestMethod "$base/health"; OK "Go API server: $($r.status)" }
catch { FAIL "Go server not reachable. Start it with: cd go && go run ./cmd/server" }

try { $r = Invoke-RestMethod "$test/health"; OK "Test server:    $($r.status)" }
catch { FAIL "Test server not reachable. Start it with: cd go && go run ./test/server" }

# ── 1. Probe O(1) endpoint ────────────────────────────────────────────────────
Step "Probing O(1) endpoint — /constant"

$body = @{
    endpoint           = "$test/constant?n={{n}}"
    method             = "GET"
    input_sizes        = @(1,2,4,8,16,32)
    concurrency_levels = @(1,2)
    warmup_rounds      = 1
    samples_per_step   = 3
    step_warmup        = 0
    timeout_ms         = 3000
} | ConvertTo-Json

$probe1 = Invoke-RestMethod -Method Post -Uri "$base/api/probe" -Body $body -ContentType "application/json"
OK "Complexity: $($probe1.fit_result.complexity_class)  R²=$([math]::Round($probe1.fit_result.r_squared,3))"

# ── 2. Save O(1) as deployment v1 ─────────────────────────────────────────────
Step "Saving O(1) result as deployment v1"

$save1 = @{
    endpoint           = "$test/constant"
    version            = "v1.0"
    notes              = "baseline — O(1) constant endpoint"
    fingerprint_vector = $probe1.fingerprint_vector
    fitted_curve       = ($probe1.fit_result.fitted_curve | ConvertTo-Json -Compress)
    sweep_result       = ($probe1.sweep_points | ConvertTo-Json -Compress)
} | ConvertTo-Json

$saved1 = Invoke-RestMethod -Method Post -Uri "$base/api/deployments" -Body $save1 -ContentType "application/json"
OK "Saved as ID $($saved1.id)"
$id1 = $saved1.id

# ── 3. Probe O(n²) endpoint ───────────────────────────────────────────────────
Step "Probing O(n²) endpoint — /quadratic (simulated regression)"

$body2 = @{
    endpoint           = "$test/quadratic?n={{n}}"
    method             = "GET"
    input_sizes        = @(1,2,4,8,16,32)
    concurrency_levels = @(1,2)
    warmup_rounds      = 1
    samples_per_step   = 3
    step_warmup        = 0
    timeout_ms         = 5000
} | ConvertTo-Json

$probe2 = Invoke-RestMethod -Method Post -Uri "$base/api/probe" -Body $body2 -ContentType "application/json"
OK "Complexity: $($probe2.fit_result.complexity_class)  R²=$([math]::Round($probe2.fit_result.r_squared,3))"

# ── 4. Save O(n²) as deployment v2 ────────────────────────────────────────────
Step "Saving O(n²) result as deployment v2"

$save2 = @{
    endpoint           = "$test/constant"
    version            = "v2.0"
    notes              = "regression — algorithm changed to O(n²)"
    fingerprint_vector = $probe2.fingerprint_vector
    fitted_curve       = ($probe2.fit_result.fitted_curve | ConvertTo-Json -Compress)
    sweep_result       = ($probe2.sweep_points | ConvertTo-Json -Compress)
} | ConvertTo-Json

$saved2 = Invoke-RestMethod -Method Post -Uri "$base/api/deployments" -Body $save2 -ContentType "application/json"
OK "Saved as ID $($saved2.id)"
$id2 = $saved2.id

# ── 5. Diff v1 vs v2 ──────────────────────────────────────────────────────────
Step "Diffing v1 vs v2 (should detect regression)"

$diff = Invoke-RestMethod "$base/api/diff?a=$id1&b=$id2"
Write-Host "    Summary:" -ForegroundColor Yellow
$diff.summary | ForEach-Object { Write-Host "      - $_" }
Write-Host "    Deltas:" -ForegroundColor Yellow
$diff.deltas | ForEach-Object {
    Write-Host ("      {0,-22} {1} → {2}  ({3})" -f $_.field, $_.a, $_.b, $_.direction)
}

# ── 6. Timeline ───────────────────────────────────────────────────────────────
Step "Timeline for endpoint (oldest → newest)"

$timeline = Invoke-RestMethod "$base/api/timeline?endpoint=$test/constant"
$timeline | ForEach-Object {
    Write-Host "      [$($_.ID)] $($_.Version)  $($_.Vector.ComplexityClass)  created=$($_.CreatedAt)"
}
OK "$($timeline.Count) entries in chronological order"

# ── 7. Similarity search ──────────────────────────────────────────────────────
Step "Searching for deployments similar to O(n²) fingerprint"

$searchBody = @{
    fingerprint_vector = $probe2.fingerprint_vector
} | ConvertTo-Json

$results = Invoke-RestMethod -Method Post -Uri "$base/api/search" -Body $searchBody -ContentType "application/json"
$results | ForEach-Object {
    Write-Host ("      score={0:F3}  [{1}] {2}  {3}" -f $_.score, $_.deployment.ID, $_.deployment.Version, $_.deployment.Vector.ComplexityClass)
}
OK "Search complete — v2 should be score ~1.0, v1 should be lower"

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "`n==> Demo complete." -ForegroundColor Green
