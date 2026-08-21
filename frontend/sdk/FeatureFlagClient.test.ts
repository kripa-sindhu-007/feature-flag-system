import { describe, it, expect, vi, afterEach } from "vitest";
import { FeatureFlagClient, fnv1a32 } from "./FeatureFlagClient";

function flagPayload(
  key: string,
  enabled: boolean,
  pct: number,
  version: number
) {
  return {
    id: "1",
    key,
    description: "",
    enabled,
    rollout_percentage: pct,
    targeted_users: [],
    version,
  };
}

function mockEventsResponse(events: unknown[], configVersion: number) {
  return {
    ok: true,
    json: async () => ({ events, config_version: configVersion }),
  } as Response;
}

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

describe("reconcile after a gap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("replays the ordered backlog and converges to the latest version", async () => {
    const events = [
      {
        version: 42,
        event_type: "updated",
        flag_key: "checkout",
        payload: flagPayload("checkout", true, 60, 42),
        created_at: "",
      },
      {
        version: 43,
        event_type: "created",
        flag_key: "beta",
        payload: flagPayload("beta", true, 100, 43),
        created_at: "",
      },
      {
        version: 44,
        event_type: "updated",
        flag_key: "checkout",
        payload: flagPayload("checkout", false, 60, 44),
        created_at: "",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockEventsResponse(events, 44))
    );

    const client = new FeatureFlagClient({
      baseUrl: "http://localhost",
      sdkKey: "test",
    });
    await client.reconcile();

    expect(client.getConfigVersion()).toBe(44);
    expect(client.getAllFlags().has("beta")).toBe(true);
    // v44 disabled checkout, so it evaluates false for everyone.
    expect(client.isEnabled("checkout", "user-1")).toBe(false);
    expect(client.isEnabled("beta", "anyone")).toBe(true);
  });

  it("is idempotent — reconciling again does not regress", async () => {
    const events = [
      {
        version: 42,
        event_type: "updated",
        flag_key: "checkout",
        payload: flagPayload("checkout", false, 60, 42),
        created_at: "",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockEventsResponse(events, 42))
    );

    const client = new FeatureFlagClient({
      baseUrl: "http://localhost",
      sdkKey: "test",
    });
    await client.reconcile();
    await client.reconcile();
    await client.reconcile();

    expect(client.getConfigVersion()).toBe(42);
    expect(client.isStale(42)).toBe(false);
  });
});
