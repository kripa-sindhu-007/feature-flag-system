package ffclient

import (
	"math"
	"sort"
)

// Stats is a percentile summary of a set of latency/throughput samples. Units
// are whatever the caller fed in (the load driver uses milliseconds for
// propagation latency and microseconds for per-eval latency).
type Stats struct {
	Count int     `json:"count"`
	Min   float64 `json:"min"`
	P50   float64 `json:"p50"`
	P95   float64 `json:"p95"`
	P99   float64 `json:"p99"`
	Max   float64 `json:"max"`
	Mean  float64 `json:"mean"`
}

// Percentiles computes a Stats summary from samples using the nearest-rank
// method (p-th percentile = the value at ceil(p/100 * N), 1-indexed). It does
// not mutate the caller's slice. An empty input yields a zero-value Stats.
//
// Nearest-rank is deliberate: it is exact, needs no interpolation, and always
// returns a value that actually occurred in the sample — which is what we want
// when publishing measured (not modeled) numbers.
func Percentiles(samples []float64) Stats {
	n := len(samples)
	if n == 0 {
		return Stats{}
	}
	sorted := make([]float64, n)
	copy(sorted, samples)
	sort.Float64s(sorted)

	var sum float64
	for _, v := range sorted {
		sum += v
	}

	return Stats{
		Count: n,
		Min:   sorted[0],
		P50:   nearestRank(sorted, 50),
		P95:   nearestRank(sorted, 95),
		P99:   nearestRank(sorted, 99),
		Max:   sorted[n-1],
		Mean:  sum / float64(n),
	}
}

// nearestRank returns the p-th percentile of an already-sorted slice using the
// nearest-rank method: rank = ceil(p/100 * N), clamped to [1, N].
func nearestRank(sorted []float64, p float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	rank := int(math.Ceil(p / 100 * float64(n)))
	if rank < 1 {
		rank = 1
	}
	if rank > n {
		rank = n
	}
	return sorted[rank-1]
}
