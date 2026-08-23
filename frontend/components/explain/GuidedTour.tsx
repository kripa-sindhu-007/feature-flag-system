"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

/**
 * The first-run guided tour: a small, NON-modal floating panel that walks a
 * newcomer through the app one concept at a time. Non-modal on purpose — each
 * step has a "Go there" link, and the panel persists across navigation so you
 * can read the step while looking at the real screen it describes.
 *
 * State lives in a tiny localStorage-backed module store (same shape as
 * ExplainProvider): once dismissed/finished it won't auto-open again, but the
 * "Take the tour" button can reopen it any time.
 */

const SEEN_KEY = "flagplane-tour-seen";

// override: null = follow first-run (open iff not seen); true/false = explicit.
let override: boolean | null = null;
const listeners = new Set<() => void>();

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // no storage → treat as seen (don't nag)
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
function emit() {
  listeners.forEach((l) => l());
}
function readOpen(): boolean {
  return override === null ? !seen() : override;
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function openTour() {
  override = true;
  emit();
}
function closeTour() {
  override = false;
  markSeen();
  emit();
}

/** Whether the tour panel is currently open (SSR-safe; closed on the server). */
export function useTourOpen(): boolean {
  return useSyncExternalStore(subscribe, readOpen, () => false);
}

type Step = {
  chapter: string;
  title: string;
  body: React.ReactNode;
  href: string;
  linkLabel: string;
};

const STEPS: Step[] = [
  {
    chapter: "1 · What a flag is",
    title: "A switch for your app",
    body: "A feature flag turns something on or off without a redeploy. Start on the Overview and flip hero-demo to watch one change travel end to end.",
    href: "/",
    linkLabel: "Go to Overview",
  },
  {
    chapter: "2 · Percentage rollout",
    title: "25% isn't random",
    body: "Each user gets a fixed dice roll from a hash of their id, so the same person always lands the same side. Drag the rollout on the Demo and watch who flips.",
    href: "/demo",
    linkLabel: "Go to Demo",
  },
  {
    chapter: "3 · Why ON or OFF",
    title: "Read the decision",
    body: "Targeting is an always-on allow-list checked before the percentage. The Demo's “Why ON/OFF?” card shows the exact three-step verdict for any user.",
    href: "/demo",
    linkLabel: "Open the explainer",
  },
  {
    chapter: "4 · Local evaluation",
    title: "The decision is instant",
    body: "The SDK evaluates flags on the device with zero network calls — that's why it's fast and works offline. Switch users on the Demo to see it decide per person.",
    href: "/demo",
    linkLabel: "Try the Demo",
  },
  {
    chapter: "5 · Real-time updates",
    title: "Pushed, not polled",
    body: "Changes are pushed to every client over a live stream (SSE). The Cluster page has a human-readable feed — flip a flag and watch it appear within milliseconds.",
    href: "/cluster",
    linkLabel: "See the live feed",
  },
  {
    chapter: "6 · Many servers",
    title: "Diverge, then converge",
    body: "Flags run on three servers at once. Right after a change they can briefly differ, then all agree — that's convergence. The Cluster hero shows it with real timings.",
    href: "/cluster",
    linkLabel: "Watch convergence",
  },
  {
    chapter: "7 · Versioning",
    title: "Every change is a save point",
    body: "Each edit bumps a version and is recorded durably, so edits are safe even when two people change a flag at once. Open a flag to see its history.",
    href: "/flags",
    linkLabel: "Go to Flags",
  },
  {
    chapter: "8 · Failure & recovery",
    title: "It heals itself",
    body: "Lose the messenger (Redis) or a server and writes still work — everyone holds last-known-good and catches up when it returns. The Resilience page watches it live.",
    href: "/resilience",
    linkLabel: "See resilience",
  },
  {
    chapter: "You're ready",
    title: "Now make it yours",
    body: "That's the whole system. Build a flag with zero risk in the Playground, or browse every concept as a card in Learn.",
    href: "/playground",
    linkLabel: "Open the Playground",
  },
];

export function GuidedTour() {
  const open = useTourOpen();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  // Reset to the first step each time the tour is (re)opened.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const close = useCallback(() => closeTour(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const s = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="region"
      aria-label="Guided tour"
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-lg",
        !reduceMotion && "flagplane-pop"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Compass className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <span className="text-xs font-semibold text-foreground">
            A 60-second tour
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close tour"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3.5" aria-live="polite">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
          <Sparkles className="h-3 w-3" aria-hidden />
          {s.chapter}
        </p>
        <h3 className="mt-1.5 text-sm font-semibold text-foreground">{s.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>

        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          nativeButton={false}
          render={<Link href={s.href} onClick={close} />}
        >
          {s.linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <div className="flex items-center gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-4 bg-primary" : "w-1.5 bg-border"
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {isFirst ? (
            <Button size="sm" variant="ghost" onClick={close}>
              Skip
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setStep((v) => v - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          {isLast ? (
            <Button size="sm" onClick={close}>
              Done
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((v) => v + 1)}>
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A button that (re)opens the tour — for the TopBar / Overview. */
export function TourButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={openTour}
      className={className}
    >
      <Compass className="h-3.5 w-3.5" />
      Take the tour
    </Button>
  );
}
