"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  User,
  Database,
  Radio,
  Boxes,
  MonitorSmartphone,
  Zap,
  RotateCcw,
  Check,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/explain/Term";
import { useFlags } from "@/hooks/useFlags";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fetchNode, NODE_URLS } from "@/hooks/useCluster";
import { flagAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

// A dedicated, auto-seeded demo flag so "Flip it" is always safe and repeatable
// and never mutates a real flag.
const HERO_KEY = "hero-demo";
const PROPAGATION_TIMEOUT_MS = 8000;
const POLL_MS = 180;

type StageState = "idle" | "active" | "done";
type NodeLite = { url: string; id: string; arrived: boolean; ms: number | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PropagationHero() {
  const { data } = useFlags();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  // hero-demo is derived from the live flag list so its version/enabled stay
  // fresh; a separate effect seeds it once if it's missing.
  const heroFlag = data?.flags.find((f) => f.key === HERO_KEY);
  const seedingRef = useRef(false);

  const [phase, setPhase] = useState<"idle" | "running" | "converged" | "settled">(
    "idle"
  );
  const [admin, setAdmin] = useState<StageState>("idle");
  const [postgres, setPostgres] = useState<StageState>("idle");
  const [redis, setRedis] = useState<StageState>("idle");
  const [browser, setBrowser] = useState<StageState>("idle");
  const [nodes, setNodes] = useState<NodeLite[]>(
    NODE_URLS.map((url) => ({ url, id: url, arrived: false, ms: null }))
  );
  const [browserMs, setBrowserMs] = useState<number | null>(null);
  const [targetVersion, setTargetVersion] = useState<number | null>(null);
  const [narration, setNarration] = useState<string>(
    "Press Flip it to change hero-demo and watch the change travel across the cluster."
  );
  const [error, setError] = useState<string | null>(null);

  const runningRef = useRef(false);
  const t0Ref = useRef(0);
  const targetRef = useRef(0);
  const browserObservedRef = useRef<number | null>(null);

  // Populate friendly node ids (backend1/2/3) once on mount, so the idle rail
  // shows real names instead of raw URLs.
  useEffect(() => {
    let cancelled = false;
    Promise.all(NODE_URLS.map(fetchNode)).then((states) => {
      if (cancelled) return;
      setNodes((prev) =>
        prev.map((n, i) => ({ ...n, id: states[i]?.nodeId ?? n.id }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed hero-demo once if it doesn't exist yet.
  useEffect(() => {
    if (!data || heroFlag || seedingRef.current) return;
    seedingRef.current = true;
    flagAPI
      .createFlag({
        key: HERO_KEY,
        description:
          "Demo flag for the Overview propagation hero — safe to flip, not a real feature.",
        enabled: false,
        rollout_percentage: 100,
        targeted_users: [],
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ["flags"] }))
      .catch(() => {
        // Leave a retry open on the next data change if creation failed.
        seedingRef.current = false;
      });
  }, [data, heroFlag, queryClient]);

  // A persistent SSE stream to the load balancer, opened before any flip, so the
  // "pushed here live" timing is the real latency this browser observes.
  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/client/stream?key=${SDK_KEY}`);
    const onUpdate = (e: MessageEvent) => {
      if (!runningRef.current || browserObservedRef.current !== null) return;
      const version = parseInt(e.lastEventId, 10);
      let key: string | undefined;
      try {
        key = (JSON.parse(e.data) as { key?: string }).key;
      } catch {
        /* ignore malformed */
      }
      if (key && key !== HERO_KEY) return;
      if (!Number.isFinite(version) || version < targetRef.current) return;
      browserObservedRef.current = performance.now();
      const observed = Math.max(0, browserObservedRef.current - t0Ref.current);
      setBrowserMs(observed);
      setBrowser("done");
      setNarration("Pushed here live over SSE — the change reached this browser.");
    };
    es.addEventListener("flag_updated", onUpdate);
    return () => {
      es.removeEventListener("flag_updated", onUpdate);
      es.close();
    };
  }, []);

  const runFlip = useCallback(async () => {
    if (runningRef.current || !heroFlag) return;
    runningRef.current = true;
    setError(null);
    setPhase("running");
    setAdmin("active");
    setPostgres("idle");
    setRedis("idle");
    setBrowser("idle");
    setBrowserMs(null);
    setNodes(NODE_URLS.map((url) => ({ url, id: url, arrived: false, ms: null })));
    browserObservedRef.current = null;
    setNarration("Sending your change to the control plane…");

    try {
      // Read the true current global version straight from the nodes so target
      // doesn't rely on a possibly-stale React cache.
      const pre = await Promise.all(NODE_URLS.map(fetchNode));
      const preMax = Math.max(
        data?.config_version ?? 0,
        ...pre.map((n) => (n.ok && n.configVersion !== null ? n.configVersion : 0))
      );
      const target = preMax + 1;
      targetRef.current = target;
      setTargetVersion(target);

      // t0 = the moment we send the change. On localhost the live SSE push can
      // arrive *before* the toggle's own HTTP response resolves (they race), so
      // measuring from the response would clamp to ~0 and hide the real latency.
      // Measuring from send gives the true client-observed end-to-end time: from
      // your action to the change appearing live here. Node arrivals share this
      // same t0, so every ms shown is real and comparable.
      const t0 = performance.now();
      t0Ref.current = t0;
      await flagAPI.toggleFlag(heroFlag.id);
      queryClient.invalidateQueries({ queryKey: ["flags"] });
      queryClient.invalidateQueries({ queryKey: ["cluster"] });

      setAdmin("done");
      setPostgres("done");
      setNarration(
        `Saved first — written to Postgres, the source of truth. It's now v${target}.`
      );
      // Pace the Redis beat for readability, but don't block the node polling on
      // it — polling starts now so per-node arrival times aren't inflated by the
      // cosmetic narration delay.
      const redisTimer = setTimeout(
        () => {
          setRedis("done");
          setNarration("Announced — Redis fans the change out to every server.");
        },
        reducedMotion ? 0 : 240
      );

      // Poll each backend until it reaches the new version; light it green with
      // its real per-node arrival time.
      const arrival: Record<string, number> = {};
      const deadline = performance.now() + PROPAGATION_TIMEOUT_MS;
      let converged = false;

      while (performance.now() < deadline) {
        const states = await Promise.all(NODE_URLS.map(fetchNode));
        let allArrived = true;
        for (const s of states) {
          const reached =
            s.ok && s.configVersion !== null && s.configVersion >= target;
          if (reached && arrival[s.url] === undefined) {
            arrival[s.url] = Math.max(0, performance.now() - t0);
          }
          if (!reached) allArrived = false;
        }
        setNodes(
          states.map((s) => ({
            url: s.url,
            id: s.nodeId,
            arrived: arrival[s.url] !== undefined,
            ms: arrival[s.url] ?? null,
          }))
        );
        const arrivedCount = Object.keys(arrival).length;
        if (arrivedCount > 0 && arrivedCount < NODE_URLS.length) {
          setNarration(
            `Servers catching up — ${arrivedCount} of ${NODE_URLS.length} now on v${target}.`
          );
        }
        if (allArrived && browserObservedRef.current !== null) {
          converged = true;
          break;
        }
        await sleep(POLL_MS);
      }

      clearTimeout(redisTimer);
      setRedis("done");
      queryClient.invalidateQueries({ queryKey: ["flags"] });
      queryClient.invalidateQueries({ queryKey: ["cluster"] });

      if (converged) {
        setPhase("converged");
        const observed =
          browserObservedRef.current !== null
            ? Math.max(0, browserObservedRef.current - t0)
            : null;
        if (observed !== null) setBrowserMs(observed);
        setNarration(
          "Converged — every server agrees on the new version, and you saw it live."
        );
      } else {
        setPhase("settled");
        const arrivedCount = Object.keys(arrival).length;
        setNarration(
          `Still propagating — ${arrivedCount} of ${NODE_URLS.length} servers caught up so far. A lagging node catches up on its own.`
        );
      }
    } catch {
      setError("Couldn't reach the control plane. Is the stack running on :8080?");
      setPhase("idle");
      setAdmin("idle");
      setNarration(
        "Press Flip it to change hero-demo and watch the change travel across the cluster."
      );
    } finally {
      runningRef.current = false;
    }
  }, [heroFlag, data?.config_version, queryClient, reducedMotion]);

  const running = phase === "running";
  const arrivedCount = nodes.filter((n) => n.arrived).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header + controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Zap className="h-4 w-4" strokeWidth={2} />
            </span>
            <h3 className="text-[15px] font-semibold text-foreground">
              Flip a flag, watch it travel
            </h3>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            <code className="font-mono text-foreground">hero-demo</code> is a
            safe, throwaway flag. Flip it and follow the change from your click
            all the way to this browser — every step and every number is real.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={runFlip} disabled={running || !heroFlag} size="lg">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Flip it
          </Button>
          {(phase === "converged" || phase === "settled") && (
            <Button
              onClick={runFlip}
              disabled={running}
              variant="outline"
              size="lg"
            >
              <RotateCcw className="h-4 w-4" />
              Replay
            </Button>
          )}
        </div>
      </div>

      {/* The stage rail */}
      <div className="px-5 py-6 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          <Stage
            icon={User}
            label="You"
            sub="admin change"
            state={admin}
            variant="accent"
          />
          <Connector active={admin === "done"} reducedMotion={reducedMotion} />
          <Stage
            icon={Database}
            label="Postgres"
            sub="source of truth"
            state={postgres}
            variant="accent"
          />
          <Connector active={postgres === "done"} reducedMotion={reducedMotion} />
          <Stage
            icon={Radio}
            label="Redis"
            sub="the messenger"
            state={redis}
            variant="accent"
          />
          <Connector
            active={redis === "done" && arrivedCount > 0}
            reducedMotion={reducedMotion}
          />
          {/* Backends */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-background/40 p-2">
            <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {NODE_URLS.length} backends
            </p>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {nodes.map((n) => (
                <NodeChip key={n.url} node={n} />
              ))}
            </div>
          </div>
          <Connector active={browser === "done"} reducedMotion={reducedMotion} />
          <Stage
            icon={MonitorSmartphone}
            label="This browser"
            sub={browserMs !== null ? `${Math.round(browserMs)} ms` : "pushed live"}
            state={browser}
            variant="live"
          />
        </div>

        {/* Narration + result */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p
            className="flex items-center gap-2 text-sm text-foreground"
            aria-live="polite"
          >
            {running && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            )}
            {narration}
          </p>

          {(phase === "converged" || phase === "settled") &&
            targetVersion !== null && (
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
                  phase === "converged"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-warning/30 bg-warning/10 text-warning"
                )}
                aria-live="polite"
              >
                {phase === "converged" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                {phase === "converged" ? (
                  <span>
                    <Term name="convergence">Converged</Term> at{" "}
                    <span className="font-mono tabular-nums">v{targetVersion}</span>
                    {browserMs !== null && (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">
                          {Math.round(browserMs)} ms
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="font-mono tabular-nums">
                    {arrivedCount}/{NODE_URLS.length} on v{targetVersion}
                  </span>
                )}
              </div>
            )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function Stage({
  icon: Icon,
  label,
  sub,
  state,
  variant,
}: {
  icon: typeof User;
  label: string;
  sub: string;
  state: StageState;
  /** accent = indigo when done (infra step); live = green when done (endpoint). */
  variant: "accent" | "live";
}) {
  const doneClass =
    variant === "live"
      ? "border-success/40 bg-success/10"
      : "border-primary/40 bg-primary/10";
  const iconDone = variant === "live" ? "text-success" : "text-primary";

  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-lg border px-3 py-3 transition-colors lg:flex-col lg:items-center lg:justify-center lg:gap-1.5 lg:text-center",
        state === "done"
          ? doneClass
          : state === "active"
          ? "border-primary/40 bg-primary/[0.06]"
          : "border-border bg-background/40"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          state === "done"
            ? cn("bg-transparent", iconDone)
            : state === "active"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {state === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={2} />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
          {sub}
        </p>
      </div>
    </div>
  );
}

function NodeChip({ node }: { node: NodeLite }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
        node.arrived
          ? "flagplane-pop border-success/40 bg-success/10"
          : "border-border bg-background/40"
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded",
          node.arrived ? "text-success" : "text-muted-foreground"
        )}
      >
        {node.arrived ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        ) : (
          <Boxes className="h-3.5 w-3.5" strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
        {node.id}
      </span>
      {node.arrived && node.ms !== null && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-success">
          {Math.round(node.ms)} ms
        </span>
      )}
    </div>
  );
}

function Connector({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div className="relative flex items-center justify-center lg:w-6">
      {/* Track: vertical on mobile, horizontal on desktop */}
      <div
        className={cn(
          "relative h-4 w-px overflow-hidden rounded-full lg:h-px lg:w-full",
          active ? "bg-primary/50" : "bg-border"
        )}
      >
        {active && !reducedMotion && (
          <span
            className="flagplane-flow-dot absolute top-1/2 hidden h-1 w-3 -translate-y-1/2 rounded-full bg-primary lg:block"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
