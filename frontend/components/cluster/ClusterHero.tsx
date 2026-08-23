"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  RotateCcw,
  Loader2,
  Boxes,
  Check,
  Database,
  Radio,
  User,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/explain/Term";
import { useFlags } from "@/hooks/useFlags";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fetchNode, NODE_URLS } from "@/hooks/useCluster";
import { flagAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

const HERO_KEY = "hero-demo";
const PROPAGATION_TIMEOUT_MS = 8000;
const POLL_MS = 160;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "running" | "converged" | "settled";
type NodeRow = {
  url: string;
  id: string;
  preVersion: number | null;
  curVersion: number | null;
  arrived: boolean;
  ms: number | null;
};

const initialNodes = (): NodeRow[] =>
  NODE_URLS.map((url) => ({
    url,
    id: url,
    preVersion: null,
    curVersion: null,
    arrived: false,
    ms: null,
  }));

/**
 * The distributed hero, tuned for the Cluster page: the 3 backends are the whole
 * show. Flip the safe `hero-demo` flag and watch each server move from its old
 * version to the new one — briefly *diverged* (some ahead, some behind), then
 * *converged* when all agree. Every version and every millisecond is real,
 * polled from each node's `/api/client/version`.
 */
export function ClusterHero() {
  const { data } = useFlags();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  const heroFlag = data?.flags.find((f) => f.key === HERO_KEY);
  const seedingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<"idle" | "active" | "done">("idle");
  const [nodes, setNodes] = useState<NodeRow[]>(initialNodes);
  const [target, setTarget] = useState<number | null>(null);
  const [narration, setNarration] = useState(
    "Press Flip it to change hero-demo and watch all three servers converge."
  );
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  // Show real node ids + current versions at rest.
  useEffect(() => {
    let cancelled = false;
    Promise.all(NODE_URLS.map(fetchNode)).then((states) => {
      if (cancelled) return;
      setNodes((prev) =>
        prev.map((n, i) => ({
          ...n,
          id: states[i]?.nodeId ?? n.id,
          curVersion: states[i]?.configVersion ?? n.curVersion,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed hero-demo once if missing.
  useEffect(() => {
    if (!data || heroFlag || seedingRef.current) return;
    seedingRef.current = true;
    flagAPI
      .createFlag({
        key: HERO_KEY,
        description:
          "Demo flag for the propagation hero — safe to flip, not a real feature.",
        enabled: false,
        rollout_percentage: 100,
        targeted_users: [],
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ["flags"] }))
      .catch(() => {
        seedingRef.current = false;
      });
  }, [data, heroFlag, queryClient]);

  const runFlip = useCallback(async () => {
    if (runningRef.current || !heroFlag) return;
    runningRef.current = true;
    setError(null);
    setPhase("running");
    setSource("active");
    setTarget(null);

    try {
      // Capture each node's current version *before* the change, so the cards can
      // show the real vOld → vNew transition and the divergence in between.
      const pre = await Promise.all(NODE_URLS.map(fetchNode));
      const preMax = Math.max(
        data?.config_version ?? 0,
        ...pre.map((n) => (n.ok && n.configVersion !== null ? n.configVersion : 0))
      );
      const tgt = preMax + 1;
      setTarget(tgt);
      setNodes(
        NODE_URLS.map((url, i) => ({
          url,
          id: pre[i]?.nodeId ?? url,
          preVersion: pre[i]?.configVersion ?? null,
          curVersion: pre[i]?.configVersion ?? null,
          arrived: false,
          ms: null,
        }))
      );
      setNarration("Saving your change to Postgres, then announcing it on Redis…");

      const t0 = performance.now();
      await flagAPI.toggleFlag(heroFlag.id);
      queryClient.invalidateQueries({ queryKey: ["flags"] });
      queryClient.invalidateQueries({ queryKey: ["cluster"] });
      setSource("done");

      const arrival: Record<string, number> = {};
      const deadline = performance.now() + PROPAGATION_TIMEOUT_MS;
      let converged = false;

      while (performance.now() < deadline) {
        const states = await Promise.all(NODE_URLS.map(fetchNode));
        let allArrived = true;
        for (const s of states) {
          const reached = s.ok && s.configVersion !== null && s.configVersion >= tgt;
          if (reached && arrival[s.url] === undefined) {
            arrival[s.url] = Math.max(0, performance.now() - t0);
          }
          if (!reached) allArrived = false;
        }
        setNodes((prev) =>
          prev.map((n) => {
            const s = states.find((x) => x.url === n.url);
            return {
              ...n,
              id: s?.nodeId ?? n.id,
              curVersion: s?.configVersion ?? n.curVersion,
              arrived: arrival[n.url] !== undefined,
              ms: arrival[n.url] ?? n.ms,
            };
          })
        );
        const arrivedCount = Object.keys(arrival).length;
        if (arrivedCount > 0 && arrivedCount < NODE_URLS.length) {
          setNarration(
            `Diverged — ${arrivedCount} of ${NODE_URLS.length} servers on v${tgt}, the rest catching up.`
          );
        }
        if (allArrived) {
          converged = true;
          break;
        }
        await sleep(POLL_MS);
      }

      queryClient.invalidateQueries({ queryKey: ["cluster"] });
      if (converged) {
        setPhase("converged");
        setNarration("Converged — all three servers now agree on the new version.");
      } else {
        setPhase("settled");
        const arrivedCount = Object.keys(arrival).length;
        setNarration(
          `Still catching up — ${arrivedCount} of ${NODE_URLS.length} on v${tgt}. A lagging node reconciles on its own.`
        );
      }
    } catch {
      setError("Couldn't reach the control plane. Is the stack running on :8080?");
      setPhase("idle");
      setSource("idle");
      setNarration(
        "Press Flip it to change hero-demo and watch all three servers converge."
      );
    } finally {
      runningRef.current = false;
    }
  }, [heroFlag, data?.config_version, queryClient]);

  const running = phase === "running";
  const arrivedCount = nodes.filter((n) => n.arrived).length;
  const diverged = running && arrivedCount > 0 && arrivedCount < NODE_URLS.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Boxes className="h-4 w-4" strokeWidth={2} />
            </span>
            <h3 className="text-[15px] font-semibold text-foreground">
              One change, all three servers
            </h3>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Flip the safe <code className="font-mono text-foreground">hero-demo</code>{" "}
            flag and watch each backend move to the new version — diverged for a
            blink, then <Term name="convergence">converged</Term>. Real versions,
            real milliseconds.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={runFlip} disabled={running || !heroFlag} size="lg">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Flip it
          </Button>
          {(phase === "converged" || phase === "settled") && (
            <Button onClick={runFlip} disabled={running} variant="outline" size="lg">
              <RotateCcw className="h-4 w-4" />
              Replay
            </Button>
          )}
        </div>
      </div>

      <div className="px-5 py-6 md:px-6">
        {/* Compact source rail */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceStep icon={User} label="You" done={source !== "idle"} />
          <ArrowRight className="h-3.5 w-3.5 opacity-50" aria-hidden />
          <SourceStep icon={Database} label="Postgres" done={source === "done"} />
          <ArrowRight className="h-3.5 w-3.5 opacity-50" aria-hidden />
          <SourceStep icon={Radio} label="Redis" done={source === "done"} />
          <ArrowRight className="h-3.5 w-3.5 opacity-50" aria-hidden />
          <span className="font-medium text-foreground/70">3 backends:</span>
        </div>

        {/* The 3-node lane — the star of this page */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {nodes.map((n) => (
            <NodeCard key={n.url} node={n} target={target} reducedMotion={reducedMotion} />
          ))}
        </div>

        {/* Narration + convergence badge */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-foreground" aria-live="polite">
            {running && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
            {narration}
          </p>
          {target !== null && (phase === "converged" || phase === "settled" || diverged) && (
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
                phase === "converged"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              )}
              aria-live="polite"
            >
              {phase === "converged" ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>
                    Converged at <span className="font-mono tabular-nums">v{target}</span>
                  </span>
                </>
              ) : (
                <span className="font-mono tabular-nums">
                  Diverged · {arrivedCount}/{NODE_URLS.length} on v{target}
                </span>
              )}
            </span>
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

function NodeCard({
  node,
  target,
  reducedMotion,
}: {
  node: NodeRow;
  target: number | null;
  reducedMotion: boolean;
}) {
  const behind = target !== null && !node.arrived;
  const showTransition =
    target !== null && node.preVersion !== null && !node.arrived;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        node.arrived
          ? cn("border-success/40 bg-success/10", !reducedMotion && "flagplane-pop")
          : behind
            ? "border-warning/40 bg-warning/[0.06]"
            : "border-border bg-background/40"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              node.arrived ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
            )}
          >
            {node.arrived ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Boxes className="h-4 w-4" />}
          </span>
          <span className="font-mono text-sm font-medium text-foreground">{node.id}</span>
        </div>
        {node.arrived && node.ms !== null && (
          <span className="font-mono text-xs tabular-nums text-success">
            {Math.round(node.ms)} ms
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          config version
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-2xl font-semibold tabular-nums">
          {showTransition ? (
            <>
              <span className="text-muted-foreground/60 line-through decoration-1">
                v{node.preVersion}
              </span>
              <ArrowRight className="h-4 w-4 text-warning" aria-hidden />
              <span className="text-warning">v{target}?</span>
            </>
          ) : (
            <span className={node.arrived ? "text-success" : "text-foreground"}>
              {node.curVersion !== null ? `v${node.curVersion}` : "—"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function SourceStep({
  icon: Icon,
  label,
  done,
}: {
  icon: typeof User;
  label: string;
  done: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
        done ? "border-primary/40 bg-primary/[0.06] text-primary" : "border-border"
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}
