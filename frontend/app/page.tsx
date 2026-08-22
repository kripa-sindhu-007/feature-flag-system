"use client";

import Link from "next/link";
import {
  Flag,
  FlaskConical,
  ArrowRight,
  Power,
  Percent,
  Users,
  Activity,
  Radio,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlags } from "@/hooks/useFlags";
import { useSSE } from "@/hooks/useSSE";
import { useReadiness, useFleetMetrics } from "@/hooks/useHealth";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const { data } = useFlags();
  const flags = data?.flags;
  useSSE();

  const total = flags?.length ?? 0;
  const enabled = flags?.filter((f) => f.enabled).length ?? 0;
  const avgRollout = total
    ? Math.round((flags!.reduce((s, f) => s + f.rollout_percentage, 0) / total))
    : 0;
  const targeted = flags?.filter((f) => f.targeted_users.length > 0).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Overview
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A self-hosted feature-flag control plane — rollouts, targeting, and
          real-time propagation.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Flag} label="Total flags" value={total} />
        <StatTile
          icon={Power}
          label="Enabled"
          value={enabled}
          hint={total ? `of ${total}` : undefined}
        />
        <StatTile icon={Percent} label="Avg rollout" value={`${avgRollout}%`} />
        <StatTile icon={Users} label="With targeting" value={targeted} />
      </div>

      {/* Health strip */}
      <HealthStrip />

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          icon={Flag}
          title="Manage flags"
          description="Create, roll out, target, and toggle feature flags."
          href="/flags"
          cta="Open flags"
        />
        <ActionCard
          icon={FlaskConical}
          title="Try the demo"
          description="See per-user local evaluation as flags change live."
          href="/demo"
          cta="Open demo"
          variant="secondary"
        />
      </div>
    </div>
  );
}

function ms(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const v = seconds * 1000;
  return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
}

function HealthStrip() {
  const { data: nodes } = useReadiness();
  const { data: metrics } = useFleetMetrics();

  const nodeList = nodes ?? [];
  const readyCount = nodeList.filter((n) => n.ready).length;
  const total = nodeList.length;
  const allReady = total > 0 && readyCount === total;

  return (
    <Link
      href="/health"
      className="group flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
    >
      <span className="inline-flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fleet health
        </span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            total === 0
              ? "bg-muted-foreground/60"
              : allReady
              ? "bg-success"
              : "bg-warning"
          )}
        />
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {total === 0 ? "—" : `${readyCount}/${total}`}
        </span>
        <span className="text-xs text-muted-foreground">ready</span>
      </span>

      <StripMetric
        icon={Radio}
        value={
          metrics?.unavailable ? null : metrics?.sseClients ?? null
        }
        unit="SSE"
      />
      <StripMetric
        icon={Gauge}
        value={metrics?.unavailable ? null : ms(metrics?.propagationP99 ?? null)}
        unit="ms p99"
      />

      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        Health
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function StripMetric({
  icon: Icon,
  value,
  unit,
}: {
  icon: typeof Radio;
  value: string | number | null;
  unit: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {value ?? "—"}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flag;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  cta,
  variant = "default",
}: {
  icon: typeof Flag;
  title: string;
  description: string;
  href: string;
  cta: string;
  variant?: "default" | "secondary";
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      <Button
        variant={variant}
        className="mt-4 self-start"
        nativeButton={false}
        render={<Link href={href} />}
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
