import { describe, it, expect } from "vitest";
import { evaluate, rolloutBucket, type EvaluableFlag } from "./evaluate";
import { FeatureFlagClient, fnv1a32 } from "../sdk/FeatureFlagClient";
import type { FlagConfig } from "../types/flag";

/**
 * The whole point of lib/evaluate is that the teaching UI narrates the *exact*
 * decision the SDK ships. These tests pin that: for a matrix of flags × users,
 * `evaluate().on` must equal `FeatureFlagClient.isEnabled()`. If someone ever
 * tweaks one without the other, this fails.
 */

function toConfig(f: EvaluableFlag): FlagConfig {
  return {
    id: "1",
    description: "",
    version: 1,
    key: f.key,
    enabled: f.enabled,
    rollout_percentage: f.rollout_percentage,
    targeted_users: f.targeted_users,
  };
}

/** A client with a known flag map, without opening any network connection. */
function clientWith(flags: EvaluableFlag[]): FeatureFlagClient {
  const c = new FeatureFlagClient({ baseUrl: "http://x", sdkKey: "k" });
  const map = (c as unknown as { flags: Map<string, FlagConfig> }).flags;
  for (const f of flags) map.set(f.key, toConfig(f));
  return c;
}

const FLAGS: EvaluableFlag[] = [
  { key: "checkout", enabled: true, rollout_percentage: 50, targeted_users: [] },
  { key: "dark-mode", enabled: true, rollout_percentage: 0, targeted_users: ["alice"] },
  { key: "beta", enabled: true, rollout_percentage: 100, targeted_users: [] },
  { key: "ai-assistant", enabled: false, rollout_percentage: 100, targeted_users: ["bob"] },
  { key: "search", enabled: true, rollout_percentage: 25, targeted_users: ["vip"] },
];

const USERS = [
  "user-1", "user-2", "user-7", "alice", "bob", "vip", "u_1024", "carol", "dave-42",
];

describe("evaluate() parity with FeatureFlagClient.isEnabled()", () => {
  const client = clientWith(FLAGS);

  for (const flag of FLAGS) {
    for (const user of USERS) {
      it(`${flag.key} × ${user} matches the SDK`, () => {
        const sdk = client.isEnabled(flag.key, user);
        const trace = evaluate(flag, user);
        expect(trace.on).toBe(sdk);
      });
    }
  }

  it("returns OFF with reason 'no-flag' for an unknown flag", () => {
    const trace = evaluate(undefined, "user-1");
    expect(trace.on).toBe(false);
    expect(trace.reason).toBe("no-flag");
    // The SDK also returns false for a flag it doesn't hold.
    expect(client.isEnabled("does-not-exist", "user-1")).toBe(false);
  });
});

describe("rolloutBucket", () => {
  it("equals fnv1a32(key:user) % 100", () => {
    expect(rolloutBucket("checkout", "user-1")).toBe(fnv1a32("checkout:user-1") % 100);
  });

  it("is deterministic and in [0, 99]", () => {
    const a = rolloutBucket("checkout", "user-42");
    const b = rolloutBucket("checkout", "user-42");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });
});

describe("evaluate() reasons and bucket disclosure", () => {
  const flag = FLAGS[0]; // checkout, 50%

  it("targeting short-circuits before the dice roll (no bucket)", () => {
    const t = evaluate(
      { key: "x", enabled: true, rollout_percentage: 10, targeted_users: ["me"] },
      "me"
    );
    expect(t).toMatchObject({ on: true, reason: "targeted", bucket: null, targeted: true });
  });

  it("a disabled flag is off for a targeted user (kill switch wins)", () => {
    const t = evaluate(
      { key: "x", enabled: false, rollout_percentage: 100, targeted_users: ["me"] },
      "me"
    );
    expect(t).toMatchObject({ on: false, reason: "disabled" });
  });

  it("exposes the real bucket only when the dice roll actually decides", () => {
    const t = evaluate(flag, "user-1");
    expect(t.bucket).toBe(rolloutBucket("checkout", "user-1"));
    expect(t.on).toBe(t.bucket! < 50);
    expect(["in-rollout", "out-of-rollout"]).toContain(t.reason);
  });

  it("0% and 100% short-circuit without a bucket", () => {
    expect(evaluate({ key: "z", enabled: true, rollout_percentage: 0, targeted_users: [] }, "u")).toMatchObject({ on: false, reason: "rollout-zero", bucket: null });
    expect(evaluate({ key: "z", enabled: true, rollout_percentage: 100, targeted_users: [] }, "u")).toMatchObject({ on: true, reason: "rollout-full", bucket: null });
  });
});
