"use client";

import {
  Activity,
  CheckCircle2,
  XCircle,
  Database,
  Server,
  Radio,
  Gauge,
  ExternalLink,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useReadiness,
  useFleetMetrics,
  type NodeReadiness,
} from "@/hooks/useHealth";
import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { AdvancedDetails } from "@/components/explain/AdvancedDetails";
import { Term } from "@/components/explain/Term";
import { cn } from "@/lib/utils";

const GRAFANA_URL =
  process.env.NEXT_PUBLIC_GRAFANA_URL || "http://localhost:3001";

/** Format a latency in seconds as milliseconds with one decimal. */
function ms(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const v = seconds * 1000;
  return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
}

export default function HealthPage() {
  const { data: nodes, isLoading } = useReadiness();
  const { data: metrics } = useFleetMetrics();

  const nodeList = nodes ?? [];
  const readyCount = nodeList.filter((n) => n.ready).length;
  const total = nodeList.length;
  const allReady = total > 0 && readyCount === total;

  const typicalMs = metrics?.unavailable
    ? null
    : ms(metrics?.propagationP50 ?? metrics?.propagationP99 ?? null);
  const headline =
    total === 0
      ? "Checking each server…"
      : allReady
      ? typicalMs && typicalMs !== "—"
        ? `All healthy — changes reach every server in about ${typicalMs} ms.`
        : "All healthy — every server is ready to serve."
      : `Degraded — ${readyCount} of ${total} servers ready.`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        title="Is the fleet healthy?"
        subtitle={
          <>
            Whether every server is ready to serve correct data, and how fast a
            change reaches all of them. Each server answers its own{" "}
            <Term name="readyz">/readyz</Term> check.
          </>
        }
        status={
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                total === 0
                  ? "bg-muted-foreground/60"
                  : allReady
                  ? "bg-success"
                  : "bg-warning"
              )}
            />
            {headline}
          </span>
        }
        actions={
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={
              <a href={GRAFANA_URL} target="_blank" rel="noopener noreferrer" />
            }
          >
            <Gauge className="h-4 w-4" />
            Open Grafana
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <GuideCallout>
        A server is <Term name="readyz">ready</Term> only when it can reach its
        database and message bus and holds current config — so the load balancer
        never sends you to one that can&apos;t answer correctly.{" "}
        <Term name="p99">p99</Term> propagation is the near-worst case: 99% of
        changes land faster than that.
      </GuideCallout>

      <AdvancedDetails label="Metrics &amp; per-node readiness">
        <div className="space-y-6">

      {/* Fleet metric tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          icon={Radio}
          label="Live SSE clients"
          value={
            metrics?.unavailable
              ? null
              : metrics?.sseClients ?? null
          }
          unit="connected"
          unavailable={metrics?.unavailable ?? false}
        />
        <MetricTile
          icon={Gauge}
          label="Propagation p99"
          value={metrics?.unavailable ? null : ms(metrics?.propagationP99 ?? null)}
          unit="ms"
          unavailable={metrics?.unavailable ?? false}
          sub={
            metrics?.unavailable
              ? undefined
              : `p50 ${ms(metrics?.propagationP50 ?? null)} · p95 ${ms(
                  metrics?.propagationP95 ?? null
                )} ms`
          }
        />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide">
              Nodes ready
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-semibold tabular-nums",
                total === 0
                  ? "text-muted-foreground"
                  : allReady
                  ? "text-success"
                  : "text-warning"
              )}
            >
              {total === 0 ? "—" : `${readyCount}/${total}`}
            </span>
            <StatusPill ready={allReady} reachable={total > 0} label={allReady ? "healthy" : "degraded"} />
          </div>
        </div>
      </div>

      {/* Per-node readiness */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Node readiness
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && nodeList.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-lg border border-border bg-card"
                />
              ))
            : nodeList.map((node) => <NodeCard key={node.url} node={node} />)}
        </div>
      </div>

          <p className="text-xs text-muted-foreground">
            Polling each node&apos;s{" "}
            <code className="font-mono">/readyz</code> every 4s; fleet metrics
            from Prometheus every 5s.
          </p>
        </div>
      </AdvancedDetails>
    </div>
  );
}

function StatusPill({
  ready,
  reachable,
  label,
}: {
  ready: boolean;
  reachable: boolean;
  label: string;
}) {
  const down = !reachable;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        ready
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {ready ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {down ? "unreachable" : label}
    </span>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  unavailable,
}: {
  icon: typeof Radio;
  label: string;
  value: string | number | null;
  unit?: string;
  sub?: string;
  unavailable: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      {unavailable ? (
        <p className="mt-3 text-sm text-muted-foreground/70">
          metrics unavailable
        </p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline gap-1.5" aria-live="polite">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {value ?? "—"}
            </span>
            {unit && (
              <span className="text-xs text-muted-foreground">{unit}</span>
            )}
          </div>
          {sub && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {sub}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NodeCard({ node }: { node: NodeReadiness }) {
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
        <StatusPill
          ready={node.ready}
          reachable={node.reachable}
          label={node.ready ? "ready" : "unready"}
        />
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            config version
          </p>
          <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
            {node.configVersion !== null ? `v${node.configVersion}` : "—"}
          </p>
        </div>
      </div>

      {/* Dependency sub-status — always shown, emphasized on failure */}
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
