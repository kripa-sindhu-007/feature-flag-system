import { describe, it, expect } from "vitest";
import { FeatureFlagClient, fnv1a32 } from "./FeatureFlagClient";

// These buckets are shared with the Go backend's golden vector
// (backend/internal/hash/rollout_test.go). They MUST match — cross-language
// evaluation parity is a core invariant.
const GOLDEN: Array<[string, number]> = [
  ["checkout:user-1", 60],
  ["checkout:user-2", 17],
  ["dark-mode:alice", 29],
  ["beta:u_1024", 72],
  ["ai-assistant:user-7", 19],
];

describe("fnv1a32 rollout parity", () => {
  it("produces the same buckets as the Go backend", () => {
    for (const [input, bucket] of GOLDEN) {
      expect(fnv1a32(input) % 100).toBe(bucket);
    }
  });
});

describe("staleness detection", () => {
  it("starts at version 0 and detects a newer server version", () => {
    const client = new FeatureFlagClient({
      baseUrl: "http://localhost",
      sdkKey: "test",
    });
    expect(client.getConfigVersion()).toBe(0);
    expect(client.isStale(1)).toBe(true);
    expect(client.isStale(0)).toBe(false);
  });
});
