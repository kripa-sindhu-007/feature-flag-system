"use client";

import { BarChart3 } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

const STATS = [
  { value: "1.2k", label: "Users" },
  { value: "89%", label: "Uptime" },
  { value: "42ms", label: "Latency" },
];

export function BetaDashboard({ isEnabled }: { isEnabled: boolean }) {
  return (
    <FeatureCard
      icon={BarChart3}
      title="Beta dashboard"
      flagKey="beta-dashboard"
      isEnabled={isEnabled}
      disabledHint="Enable this flag to reveal the analytics panel for this user."
      enabledContent={
        <div className="grid grid-cols-3 gap-2.5">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-muted/40 p-3 text-center"
            >
              <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      }
    />
  );
}
