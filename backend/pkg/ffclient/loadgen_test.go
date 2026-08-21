package ffclient

import "testing"

// TestPercentilesKnownInput pins the nearest-rank math on a hand-computed
// sample so the published benchmark numbers can be trusted.
func TestPercentilesKnownInput(t *testing.T) {
	// 1..100 shuffled a little; nearest-rank ranks: p50=ceil(.5*100)=50th value=50,
	// p95=95th=95, p99=99th=99, min=1, max=100, mean=50.5.
	samples := make([]float64, 0, 100)
	for i := 100; i >= 1; i-- { // insert descending to prove it sorts a copy
		samples = append(samples, float64(i))
	}
	got := Percentiles(samples)

	want := Stats{Count: 100, Min: 1, P50: 50, P95: 95, P99: 99, Max: 100, Mean: 50.5}
	if got != want {
		t.Fatalf("Percentiles(1..100)\n got  %+v\n want %+v", got, want)
	}

	// The input slice must be untouched (Percentiles copies before sorting).
	if samples[0] != 100 || samples[99] != 1 {
		t.Errorf("Percentiles mutated caller's slice: samples[0]=%v samples[99]=%v", samples[0], samples[99])
	}
}

func TestPercentilesEdgeCases(t *testing.T) {
	if got := Percentiles(nil); got != (Stats{}) {
		t.Errorf("empty input: want zero Stats, got %+v", got)
	}
	// Single sample: every percentile is that value.
	got := Percentiles([]float64{42})
	want := Stats{Count: 1, Min: 42, P50: 42, P95: 42, P99: 42, Max: 42, Mean: 42}
	if got != want {
		t.Errorf("single sample:\n got  %+v\n want %+v", got, want)
	}

	// Small known set {10,20,30,40}: nearest-rank p50=ceil(2)=2nd=20,
	// p95=ceil(3.8)=4th=40, p99=ceil(3.96)=4th=40.
	got = Percentiles([]float64{40, 10, 30, 20})
	if got.P50 != 20 || got.P95 != 40 || got.P99 != 40 || got.Min != 10 || got.Max != 40 {
		t.Errorf("four-sample set: got %+v", got)
	}
	if got.Mean != 25 {
		t.Errorf("four-sample mean: want 25, got %v", got.Mean)
	}
}
