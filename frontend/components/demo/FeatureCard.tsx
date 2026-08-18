"use client";

import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/flags/StatusBadge";

export function FeatureCard({
  icon: Icon,
  title,
  flagKey,
  isEnabled,
  enabledContent,
  disabledHint,
}: {
  icon: LucideIcon;
  title: string;
  flagKey: string;
  isEnabled: boolean;
  enabledContent: React.ReactNode;
  disabledHint: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="font-mono text-xs text-muted-foreground">{flagKey}</p>
          </div>
        </div>
        <StatusBadge enabled={isEnabled} />
      </div>

      <div className="mt-4">
        {isEnabled ? (
          <div className="animate-in fade-in-50 duration-200">{enabledContent}</div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">{disabledHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
