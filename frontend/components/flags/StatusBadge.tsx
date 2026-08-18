import { cn } from "@/lib/utils";

/**
 * Status is its own visual language, separate from the indigo accent.
 * Green = on/live, muted = off. Always dot + text (never colour alone).
 */
export function StatusBadge({
  enabled,
  className,
}: {
  enabled: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        enabled
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          enabled ? "bg-success" : "bg-muted-foreground/60"
        )}
      />
      {enabled ? "On" : "Off"}
    </span>
  );
}
