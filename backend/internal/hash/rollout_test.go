package hash

import "testing"

// goldenBuckets are FNV-1a buckets — hash(flagKey:userID) % 100. These values
// MUST stay identical in the TypeScript SDK (frontend/sdk) — cross-language
// evaluation parity is a core invariant. If this vector changes, existing user
// cohorts shift, so treat a mismatch as a breaking change, not a test to update.
var goldenBuckets = []struct {
	flagKey, userID string
	bucket          int
}{
	{"checkout", "user-1", 60},
	{"checkout", "user-2", 17},
	{"dark-mode", "alice", 29},
	{"beta", "u_1024", 72},
	{"ai-assistant", "user-7", 19},
}

func TestRolloutParityVector(t *testing.T) {
	for _, g := range goldenBuckets {
		// Out at pct == bucket, in at pct == bucket+1 pins the exact bucket.
		if IsUserInRollout(g.flagKey, g.userID, g.bucket) {
			t.Errorf("%s:%s should be OUT at pct=%d (bucket=%d)", g.flagKey, g.userID, g.bucket, g.bucket)
		}
		if !IsUserInRollout(g.flagKey, g.userID, g.bucket+1) {
			t.Errorf("%s:%s should be IN at pct=%d (bucket=%d)", g.flagKey, g.userID, g.bucket+1, g.bucket)
		}
	}
}

func TestRolloutBoundaries(t *testing.T) {
	if IsUserInRollout("k", "u", 0) {
		t.Error("0% must always be false")
	}
	if IsUserInRollout("k", "u", -5) {
		t.Error("negative % must be false")
	}
	if !IsUserInRollout("k", "u", 100) {
		t.Error("100% must always be true")
	}
}

func TestRolloutDeterministic(t *testing.T) {
	for i := 0; i < 1000; i++ {
		if IsUserInRollout("checkout", "user-1", 50) != IsUserInRollout("checkout", "user-1", 50) {
			t.Fatal("evaluation is not deterministic")
		}
	}
}

// TestRolloutStickyCohort proves increasing a percentage never drops a user who
// was already in — buckets are stable, so cohorts only grow.
func TestRolloutStickyCohort(t *testing.T) {
	for _, g := range goldenBuckets {
		enteredAt := -1
		for pct := 1; pct <= 100; pct++ {
			if IsUserInRollout(g.flagKey, g.userID, pct) {
				enteredAt = pct
				break
			}
		}
		if enteredAt == -1 {
			continue
		}
		for higher := enteredAt; higher <= 100; higher++ {
			if !IsUserInRollout(g.flagKey, g.userID, higher) {
				t.Errorf("%s:%s entered at %d%% but dropped at %d%%", g.flagKey, g.userID, enteredAt, higher)
			}
		}
	}
}
