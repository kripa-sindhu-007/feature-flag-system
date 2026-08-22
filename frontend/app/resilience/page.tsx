"use client";

import {
  ShieldCheck,
  CircleCheck,
  RadioTower,
  Boxes,
  Users,
  Database,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useCluster, type NodeState } from "@/hooks/useCluster";
import {
  useReadiness,
  useRedisPublishErrors,
  type NodeReadiness,
} from "@/hooks/useHealth";
import { cn } from "@/lib/utils";

// A per-node row merges the two live sources by URL (both hooks discover nodes
// from the same NEXT_PUBLIC_NODE_URLS list, in the same order):
//   - useCluster    → config_version, sse_clients, reachability (1.5s)
//   - useReadiness  → /readyz + postgres/redis dependency probes (1.5s here)
type MergedNode = {
  url: string;
  nodeId: string;
  configVersion: number | null;
  sseClients: number | null;
  reachable: boolean;
  ready: boolean;
  postgres: string | null;
  redis: string | null;
};

export default function ResiliencePage() {
  const { data: cluster, isLoading } = useCluster();
  // Poll /readyz fast (1.5s) so a chaos-injected drop/return is visible near-live.
  const { data: readiness } = useReadiness(1500);
  const { data: publishErrors } = useRedisPublishErrors();

  const clusterNodes = cluster?.nodes ?? [];
  const converged = cluster?.converged ?? false;
  const latest = cluster?.latestVersion ?? 0;
  const reachable = cluster?.reachableCount ?? 0;

  const readyByUrl = new Map<string, NodeReadiness>(
    (readiness ?? []).map((r) => [r.url, r])
  );

  const nodes: MergedNode[] = clusterNodes.map((n: NodeState) => {
    const r = readyByUrl.get(n.url);
    return {
      url: n.url,
      nodeId: n.nodeId,
      configVersion: n.configVersion,
      sseClients: n.sseClients,
      reachable: n.ok,
      ready: r?.ready ?? false,
      postgres: r?.postgres ?? null,
      redis: r?.redis ?? null,
    };
  });

  // Version spread across reachable nodes — the divergence signal.
  const versions = nodes
    .filter((n) => n.reachable && n.configVersion !== null)
    .map((n) => n.configVersion as number);
  const minVersion = versions.length ? Math.min(...versions) : 0;
  const readyCount = nodes.filter((n) => n.ready).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Resilience
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A live, observe-only view of the cluster under chaos. Faults are
          injected out-of-band by the{" "}
          <code className="font-mono text-foreground">chaos/</code> scripts — this
          page doesn&apos;t trigger anything, it just watches each node&apos;s
          version and readiness so you can see it{" "}
          <span className="text-foreground">diverge and reconverge</span> in real
          time.
        </p>
      </div>

      {/* Convergence banner */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm",
          reachable === 0
            ? "border-destructive/30 bg-destructive/10"
            : converged
            ? "border-success/30 bg-success/10"
            : "border-warning/30 bg-warning/10"
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            reachable === 0
              ? "bg-destructive/15 text-destructive"
              : converged
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          )}
        >
          {reachable === 0 ? (
            <XCircle className="h-4 w-4" />
          ) : converged ? (
            <CircleCheck className="h-4 w-4" />
          ) : (
            <RadioTower className="h-4 w-4" />
          )}
        </span>
        <span
          className={cn(
            "font-medium",
            reachable === 0
              ? "text-destructive"
              : converged
              ? "text-success"
              : "text-warning"
          )}
        >
          {reachable === 0
            ? "No nodes reachable"
            : converged
            ? `Converged at v${latest}`
            : "Diverging"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {reachable === 0
            ? "—"
            : converged
            ? `${reachable} node${reachable > 1 ? "s" : ""} in sync`
            : `spread v${minVersion}…v${latest} across ${reachable} node${
                reachable > 1 ? "s" : ""
              }`}
        </span>
      </div>

      {/* Signal tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SignalTile
          icon={ShieldCheck}
          label="Nodes ready"
          value={nodes.length === 0 ? "—" : `${readyCount}/${nodes.length}`}
          tone={
            nodes.length === 0
              ? "muted"
              : readyCount === nodes.length
              ? "success"
              : "warning"
          }
        />
        <SignalTile
          icon={Boxes}
          label="Latest version"
          value={reachable === 0 ? "—" : `v${latest}`}
          tone="foreground"
        />
        <SignalTile
          icon={AlertTriangle}
          label="Redis publish errors"
          value={
            publishErrors?.unavailable
              ? "—"
              : String(publishErrors?.total ?? 0)
          }
          tone={
            publishErrors?.unavailable
              ? "muted"
              : (publishErrors?.total ?? 0) > 0
              ? "warning"
              : "success"
          }
          sub={
            publishErrors?.unavailable
              ? "prometheus unavailable"
              : "cumulative · fan-out health"
          }
        />
      </div>

      {/* Node grid */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Per-node state
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && nodes.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-52 animate-pulse rounded-lg border border-border bg-card"
                />
              ))
            : nodes.map((node) => (
                <NodeCard key={node.url} node={node} latest={latest} />
              ))}
        </div>
      </div>

      {/* Guarantees panel — honest, matches docs/CHAOS.md */}
      <GuaranteesPanel />

      <p className="text-xs text-muted-foreground">
        Polling each node&apos;s{" "}
        <code className="font-mono">/api/client/version</code> and{" "}
        <code className="font-mono">/readyz</code> every 1.5s; Redis publish
        errors from Prometheus every 2s.
      </p>
    </div>
  );
}

function NodeCard({ node, latest }: { node: MergedNode; latest: number }) {
  const behind =
    node.reachable && node.configVersion !== null && node.configVersion < latest;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <span className="font-mono text-sm font-medium text-foreground">
            {node.nodeId}
          </span>
        </div>
        <ReadinessPill reachable={node.reachable} ready={node.ready} />
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            config version
          </p>
          <p
            className={cn(
              "font-mono text-3xl font-semibold tabular-nums",
              !node.reachable || node.configVersion === null
                ? "text-muted-foreground"
                : behind
                ? "text-warning"
                : "text-success"
            )}
          >
            {node.reachable && node.configVersion !== null
              ? `v${node.configVersion}`
              : "—"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{node.sseClients ?? "—"}</span>
        </span>
      </div>

      {/* Dependency sub-status */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <DepStatus
          icon={Database}
          label="postgres"
          value={node.postgres}
          reachable={node.reachable}
        />
        <DepStatus
          icon={Server}
          label="redis"
          value={node.redis}
          reachable={node.reachable}
        />
      </div>
    </div>
  );
}

function ReadinessPill({
  reachable,
  ready,
}: {
  reachable: boolean;
  ready: boolean;
}) {
  if (!reachable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        down
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        ready
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-warning"
      )}
    >
      {ready ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {ready ? "ready" : "unready"}
    </span>
  );
}

function DepStatus({
  icon: Icon,
  label,
  value,
  reachable,
}: {
  icon: typeof Database;
  label: string;
  value: string | null;
  reachable: boolean;
}) {
  const ok = value === "ok";
  const unknown = !reachable || value === null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        unknown
          ? "border-border text-muted-foreground"
          : ok
          ? "border-border text-foreground"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
      title={value ?? "unknown"}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="font-mono">{label}</span>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          unknown
            ? "bg-muted-foreground/50"
            : ok
            ? "bg-success"
            : "bg-destructive"
        )}
      />
    </span>
  );
}

function SignalTile({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  tone: "success" | "warning" | "muted" | "foreground";
  sub?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-3" aria-live="polite">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            toneClass
          )}
        >
          {value}
        </span>
        {sub && (
          <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  );
}

function GuaranteesPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-primary" strokeWidth={2} />
        <h3 className="text-[15px] font-semibold text-foreground">
          What this system guarantees
        </h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="text-foreground">
          Eventual convergence with bounded, measured propagation latency and a
          durable source of truth
        </span>{" "}
        — <span className="font-medium">not</span> high availability, and{" "}
        <span className="font-medium">not</span> strong consistency.
      </p>
      <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          <span>
            <span className="font-medium text-foreground">
              Last-known-good on infra failure.
            </span>{" "}
            Writes commit to Postgres (the source of truth) before best-effort
            Redis fan-out; if Redis or a node drops, clients hold their
            last-known-good version and never regress or corrupt it.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>
            <span className="font-medium text-foreground">
              Reconcile from the durable log.
            </span>{" "}
            Any missed live event is backfilled by replaying{" "}
            <code className="font-mono">/api/client/events?since=V</code> in
            version order, so a reconnecting client catches up to the exact
            latest version.
          </span>
        </li>
      </ul>
    </div>
  );
}
