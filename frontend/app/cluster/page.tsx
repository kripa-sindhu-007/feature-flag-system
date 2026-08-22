"use client";

import { Boxes, CircleCheck, RadioTower, Users } from "lucide-react";
import { useCluster, type NodeState } from "@/hooks/useCluster";
import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { AdvancedDetails } from "@/components/explain/AdvancedDetails";
import { Term } from "@/components/explain/Term";
import { cn } from "@/lib/utils";

export default function ClusterPage() {
  const { data, isLoading } = useCluster();

  const nodes = data?.nodes ?? [];
  const converged = data?.converged ?? false;
  const latest = data?.latestVersion ?? 0;
  const reachable = data?.reachableCount ?? 0;

  const headline =
    reachable === 0
      ? "No servers are reachable right now."
      : converged
      ? `All ${reachable} server${reachable > 1 ? "s" : ""} agree — everyone is on v${latest}.`
      : "A change is spreading — the servers are catching up to each other.";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        title="One change, every server"
        subtitle="Flags run on three backends at once. This page shows whether they all agree on the latest version yet."
        status={headline}
      />

      <GuideCallout>
        Each server keeps its own copy of the config and reports which{" "}
        <Term name="config-version">version</Term> it&apos;s on. Right after a
        change they can briefly differ; the moment they all match, the cluster
        has <Term name="convergence">converged</Term>. Green means caught up.
      </GuideCallout>

      {/* Convergence banner */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm",
          converged
            ? "border-success/30 bg-success/10"
            : "border-warning/30 bg-warning/10"
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full",
            converged ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          )}
        >
          {converged ? (
            <CircleCheck className="h-4 w-4" />
          ) : (
            <RadioTower className="h-4 w-4" />
          )}
        </span>
        <span className={cn("font-medium", converged ? "text-success" : "text-warning")}>
          {reachable === 0
            ? "No nodes reachable"
            : converged
            ? `All ${reachable} node${reachable > 1 ? "s" : ""} converged`
            : "Propagating…"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          latest v{latest}
        </span>
      </div>

      {/* Per-node detail — dense, collapsed under Explain */}
      <AdvancedDetails label="Per-node detail">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading && nodes.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-36 animate-pulse rounded-lg border border-border bg-card"
                  />
                ))
              : nodes.map((node) => (
                  <NodeCard key={node.url} node={node} latest={latest} />
                ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Polling each node’s{" "}
            <code className="font-mono">/api/client/version</code> every 1.5s.
            Writes and streams flow through the load balancer on{" "}
            <code className="font-mono">:8080</code>.
          </p>
        </div>
      </AdvancedDetails>
    </div>
  );
}

function NodeCard({ node, latest }: { node: NodeState; latest: number }) {
  const behind = node.ok && node.configVersion !== null && node.configVersion < latest;

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
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          title={node.ok ? "Reachable" : "Unreachable"}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              node.ok ? "bg-success" : "bg-destructive"
            )}
          />
          <span className={node.ok ? "text-foreground" : "text-destructive"}>
            {node.ok ? "up" : "down"}
          </span>
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            config version
          </p>
          <p
            className={cn(
              "font-mono text-3xl font-semibold tabular-nums",
              behind ? "text-warning" : "text-foreground"
            )}
          >
            {node.ok && node.configVersion !== null ? `v${node.configVersion}` : "—"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">
            {node.sseClients ?? "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
