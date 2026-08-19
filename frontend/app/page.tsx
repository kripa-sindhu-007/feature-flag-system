"use client";

import Link from "next/link";
import { Flag, FlaskConical, ArrowRight, Power, Percent, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlags } from "@/hooks/useFlags";
import { useSSE } from "@/hooks/useSSE";

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
