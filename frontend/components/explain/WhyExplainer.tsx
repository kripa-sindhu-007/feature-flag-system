"use client";

import { useState } from "react";
import { Check, X, Minus, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { evaluate, type EvaluableFlag, type EvalTrace } from "@/lib/evaluate";
import { Term } from "./Term";

/**
 * "Why is this user ON or OFF?" — the explainer that turns the SDK's decision
 * into a readable, three-step trace so a newcomer can see exactly which rule
 * fired. Steps mirror `evaluate()` / the SDK exactly, and short-circuits are
 * shown honestly as "not reached" rather than pretending every step ran.
 */

type StepStatus = "pass" | "fail" | "skipped";

interface Step {
  label: string;
  detail: React.ReactNode;
  status: StepStatus;
}

function buildSteps(t: EvalTrace, flag: EvaluableFlag): Step[] {
  // Step 1 — is the flag enabled at all? (the kill switch)
  const enabled: Step = {
    label: "Is the flag enabled?",
    detail: flag.enabled
      ? "Yes — the flag is on globally, so evaluation continues."
      : "No — the flag is off for everyone (a global kill switch). Nothing else matters.",
    status: flag.enabled ? "pass" : "fail",
  };

  // Step 2 — is the user on the targeting allow-list? (checked before the %)
  const targetingReached = flag.enabled;
  const targeting: Step = {
    label: "Is this user targeted?",
    detail: !targetingReached
      ? "Not reached — the flag is disabled."
      : t.targeted
        ? "Yes — this user is on the always-on allow-list, which overrides the percentage."
        : "No — not on the allow-list, so it comes down to the rollout dice roll.",
    status: !targetingReached ? "skipped" : t.targeted ? "pass" : "fail",
  };

  // Step 3 — the deterministic rollout bucket vs the percentage.
  const rolloutReached = flag.enabled && !t.targeted;
  let rolloutStatus: StepStatus;
  let rolloutDetail: React.ReactNode;
  if (!rolloutReached) {
    rolloutStatus = "skipped";
    rolloutDetail = !flag.enabled
      ? "Not reached — the flag is disabled."
      : "Not reached — targeting already decided it (ON).";
  } else if (t.reason === "rollout-full") {
    rolloutStatus = "pass";
    rolloutDetail = "Rollout is 100% — everyone is in.";
  } else if (t.reason === "rollout-zero") {
    rolloutStatus = "fail";
    rolloutDetail = "Rollout is 0% — no one is in (via the percentage).";
  } else {
    const on = t.on;
    rolloutStatus = on ? "pass" : "fail";
    rolloutDetail = (
      <>
        <span className="font-mono tabular-nums text-foreground">
          bucket {t.bucket} {on ? "<" : "≥"} {t.percentage}%
        </span>{" "}
        —{" "}
        {on
          ? "inside the rollout, so ON."
          : "outside the rollout, so OFF."}{" "}
        <span className="text-muted-foreground">
          The bucket is a fixed hash of{" "}
          <span className="font-mono">
            {`"${flag.key}:${t.hashInput.split(":").slice(1).join(":")}"`}
          </span>
          , so it never changes for this user.
        </span>
      </>
    );
  }
  const rollout: Step = {
    label: "Inside the rollout percentage?",
    detail: rolloutDetail,
    status: rolloutStatus,
  };

  return [enabled, targeting, rollout];
}

const ICON: Record<StepStatus, React.ReactNode> = {
  pass: <Check className="h-3.5 w-3.5" aria-hidden />,
  fail: <X className="h-3.5 w-3.5" aria-hidden />,
  skipped: <Minus className="h-3.5 w-3.5" aria-hidden />,
};

const REASON_COPY: Record<EvalTrace["reason"], string> = {
  "no-flag": "This flag doesn't exist, so it's off.",
  disabled: "The flag is disabled globally.",
  targeted: "This user is targeted — an always-on override.",
  "rollout-zero": "Rollout is 0% and the user isn't targeted.",
  "rollout-full": "Rollout is 100% — everyone's in.",
  "in-rollout": "The user's fixed bucket falls inside the rollout.",
  "out-of-rollout": "The user's fixed bucket falls outside the rollout.",
};

export function WhyExplainer({
  flag,
  initialUser = "user-1",
  className,
}: {
  flag: EvaluableFlag;
  initialUser?: string;
  className?: string;
}) {
  const [user, setUser] = useState(initialUser);
  const trimmed = user.trim();
  const trace = evaluate(flag, trimmed || "");
  const steps = buildSteps(trace, flag);

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-5", className)}
      aria-label="Why is this user on or off?"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Why is a user <Term name="local-evaluation">ON or OFF</Term>?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter any user id and watch the three checks the SDK runs, in order.
      </p>

      <div className="mt-4 max-w-xs space-y-1.5">
        <Label htmlFor="why-user">User id</Label>
        <Input
          id="why-user"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="user-42"
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Verdict */}
      <div
        className={cn(
          "mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
          trace.on
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-muted/50 text-muted-foreground"
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-white",
            trace.on ? "bg-success" : "bg-muted-foreground"
          )}
          aria-hidden
        >
          {trace.on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </span>
        <span className="font-mono">{trimmed || "—"}</span>
        <ArrowRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <span>{trace.on ? "ON" : "OFF"}</span>
        <span className="ml-auto text-xs font-normal">
          {REASON_COPY[trace.reason]}
        </span>
      </div>

      {/* Steps */}
      <ol className="mt-4 space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                step.status === "pass" && "bg-success",
                step.status === "fail" && "bg-muted-foreground",
                step.status === "skipped" && "bg-border text-muted-foreground"
              )}
              aria-label={
                step.status === "pass"
                  ? "yes"
                  : step.status === "fail"
                    ? "no"
                    : "not reached"
              }
            >
              {ICON[step.status]}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.status === "skipped"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
