package hash

import "hash/fnv"

// IsUserInRollout determines if a user falls within the rollout percentage.
// Uses FNV-1a hash for fast, deterministic, well-distributed results.
func IsUserInRollout(flagKey string, userID string, percentage int) bool {
	if percentage <= 0 {
		return false
	}
	if percentage >= 100 {
		return true
	}
	h := fnv.New32a()
	h.Write([]byte(flagKey + ":" + userID))
	hashValue := h.Sum32()
	bucket := hashValue % 100
	return int(bucket) < percentage
}
