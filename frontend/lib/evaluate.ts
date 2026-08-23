/**
 * The honest evaluation trace — the single explainable version of exactly what
 * the SDK does when it decides `isEnabled(flagKey, userId)`.
 *
 * The teaching UI (rollout visualizer, "Why ON/OFF?" explainer) must never invent
 * its own math: it reuses the SDK's real `fnv1a32` and walks the same branches as
 * `FeatureFlagClient.isEnabled` — in the same order — so the card you read and the
 * decision the SDK ships are byte-for-byte the same. A parity test locks this to
 * the SDK so the two can't drift.
 *
 * Evaluation order (identical to the SDK):
 *   1. flag missing            → OFF
 *   2. flag.enabled === false  → OFF   ("kill switch")
 *   3. userId ∈ targeted_users → ON    (targeting overrides the percentage)
 *   4. percentage <= 0         → OFF
 *   5. percentage >= 100       → ON
 *   6. bucket = fnv1a32(`${key}:${userId}`) % 100;  ON iff bucket < percentage
 */
import { fnv1a32 } from "@/sdk/FeatureFlagClient";

/** Which rule in the chain produced the verdict — drives the explainer copy. */
export type EvalReason =
  | "no-flag"
  | "disabled"
  | "targeted"
  | "rollout-zero"
  | "rollout-full"
  | "in-rollout"
  | "out-of-rollout";

/** A single decision, fully traced so the UI can show *why*, not just *what*. */
export interface EvalTrace {
  /** The final answer the SDK would return. */
  on: boolean;
  /** The rule that decided it. */
  reason: EvalReason;
  /** Step 1: did the flag exist and is it enabled? (false if missing/disabled) */
  enabled: boolean;
  /** Step 2: is this user on the always-on targeting allow-list? */
  targeted: boolean;
  /** The rollout percentage on the flag (0–100). */
  percentage: number;
  /**
   * The user's fixed bucket for this flag: `fnv1a32(key:userId) % 100` (0–99).
   * Deterministic per (flagKey, userId) — the heart of "same user, same answer".
   * `null` when the bucket is irrelevant to the verdict (missing/disabled flag,
   * or a targeted user, or a 0/100% rollout short-circuit) so the UI doesn't
   * imply a dice roll happened when it didn't.
   */
  bucket: number | null;
  /** The full hashed string, for the "show your work" line in the explainer. */
  hashInput: string;
}

/** The minimal flag shape the evaluator needs — matches FlagConfig/Flag. */
export interface EvaluableFlag {
  key: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
}

/**
 * Compute the user's fixed rollout bucket for a flag: a stable dice roll in
 * [0, 99]. Exported so the visualizer can position/colour 100 users without
 * re-deriving the hash. Same input → same bucket, always.
 */
export function rolloutBucket(flagKey: string, userId: string): number {
  return fnv1a32(`${flagKey}:${userId}`) % 100;
}

/**
 * Evaluate a flag for a user and return the full trace. Pass `undefined`/`null`
 * for a missing flag. This is the one place the UI asks "is it on, and why?".
 */
export function evaluate(
  flag: EvaluableFlag | null | undefined,
  userId: string
): EvalTrace {
  const hashInput = flag ? `${flag.key}:${userId}` : `${userId}`;

  // 1. No such flag → the SDK returns false.
  if (!flag) {
    return {
      on: false,
      reason: "no-flag",
      enabled: false,
      targeted: false,
      percentage: 0,
      bucket: null,
      hashInput,
    };
  }

  const targeted = flag.targeted_users.includes(userId);
  const percentage = flag.rollout_percentage;

  // 2. Kill switch: a disabled flag is off for everyone, targeting notwithstanding.
  if (!flag.enabled) {
    return {
      on: false,
      reason: "disabled",
      enabled: false,
      targeted,
      percentage,
      bucket: null,
      hashInput,
    };
  }

  // 3. Targeting overrides the percentage — checked before the dice roll.
  if (targeted) {
    return {
      on: true,
      reason: "targeted",
      enabled: true,
      targeted: true,
      percentage,
      bucket: null,
      hashInput,
    };
  }

  // 4/5. Percentage short-circuits — no hash needed at the extremes.
  if (percentage <= 0) {
    return {
      on: false,
      reason: "rollout-zero",
      enabled: true,
      targeted: false,
      percentage,
      bucket: null,
      hashInput,
    };
  }
  if (percentage >= 100) {
    return {
      on: true,
      reason: "rollout-full",
      enabled: true,
      targeted: false,
      percentage,
      bucket: null,
      hashInput,
    };
  }

  // 6. The deterministic dice roll: bucket < percentage ⇒ ON.
  const bucket = rolloutBucket(flag.key, userId);
  const on = bucket < percentage;
  return {
    on,
    reason: on ? "in-rollout" : "out-of-rollout",
    enabled: true,
    targeted: false,
    percentage,
    bucket,
    hashInput,
  };
}
