import { cn } from "@/lib/utils";

export function RolloutBar({
  percentage,
  active,
  className,
  showLabel = true,
}: {
  percentage: number;
  active: boolean;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, percentage));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Rollout percentage"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            active ? "bg-primary" : "bg-muted-foreground/40"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {pct}%
        </span>
      )}
    </div>
  );
}
