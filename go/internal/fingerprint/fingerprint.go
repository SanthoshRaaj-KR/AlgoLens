package fingerprint

import (
	"sort"

	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
)

// Vector is the 6-field fingerprint stored per deployment.
type Vector struct {
	ComplexityClass    string
	ComplexityExponent float64
	MemoryGrowthRate   float64 // 0–1 heuristic
	ConcurrencyCliff   float64 // concurrency level where p99 doubled; 0 = not detected
	BreakingPoint      float64 // n where >=50% requests failed; 0 = not reached
	ReadWriteRatio     float64 // placeholder 0.5
}

// ConcurrencyCliff scans the sweep for the concurrency level where the
// median p99 (across all n values) more than doubles from the previous level.
// Returns 0 if no cliff was detected.
func ConcurrencyCliff(sr probe.SweepResult) float64 {
	// Group p99 values by concurrency level
	byC := map[int][]float64{}
	for _, pt := range sr.Points {
		byC[pt.Concurrency] = append(byC[pt.Concurrency], pt.P99)
	}

	levels := make([]int, 0, len(byC))
	for c := range byC {
		levels = append(levels, c)
	}
	sort.Ints(levels)

	if len(levels) < 2 {
		return 0
	}

	medianP99 := func(vals []float64) float64 {
		sorted := make([]float64, len(vals))
		copy(sorted, vals)
		sort.Float64s(sorted)
		mid := len(sorted) / 2
		if len(sorted)%2 == 0 {
			return (sorted[mid-1] + sorted[mid]) / 2
		}
		return sorted[mid]
	}

	prev := medianP99(byC[levels[0]])
	for i := 1; i < len(levels); i++ {
		cur := medianP99(byC[levels[i]])
		if prev > 0 && cur > 2.0*prev {
			return float64(levels[i])
		}
		prev = cur
	}
	return 0
}

// MemoryGrowthRate computes a 0–1 heuristic for how fast latency accelerates
// as n grows (at concurrency=1). High values suggest GC or heap pressure.
func MemoryGrowthRate(sr probe.SweepResult) float64 {
	pts := sr.PointsForConcurrency(1)
	if len(pts) < 2 {
		return 0
	}

	var totalSlope float64
	for i := 1; i < len(pts); i++ {
		dn := float64(pts[i].N - pts[i-1].N)
		dl := pts[i].P50 - pts[i-1].P50
		if dn > 0 {
			totalSlope += dl / dn
		}
	}
	avg := totalSlope / float64(len(pts)-1)
	if avg < 0 {
		return 0
	}
	// Normalise: cap at 1.0 (slope of 1ms/req-unit is already extreme)
	if avg > 1.0 {
		return 1.0
	}
	return avg
}

// BreakingPointN returns the first n value at which ≥50% of sampled requests
// failed. Returns 0 if no breaking point was observed during the sweep.
func BreakingPointN(sr probe.SweepResult) float64 {
	total := sr.Config.SamplesPerStep
	if total == 0 {
		total = 5
	}
	for _, pt := range sr.Points {
		if float64(pt.Errors)/float64(total) >= 0.5 {
			return float64(pt.N)
		}
	}
	return 0
}
