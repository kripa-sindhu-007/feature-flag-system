import { cn } from "@/lib/utils";

/**
 * The always-visible color legend. The whole UI uses one consistent code:
 * green = live, red = down, indigo = you-can-act. Rendered in the sidebar footer
 * so the meaning is never more than a glance away.
 */
const ITEMS: { dot: string; label: string; meaning: string }[] = [
  { dot: "bg-success", label: "Live", meaning: "on / healthy / caught up" },
  { dot: "bg-destructive", label: "Down", meaning: "unreachable / conflict" },
  { dot: "bg-primary", label: "Act", meaning: "you can act here" },
];

export function ColorLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("space-y-1.5", className)} aria-label="Color legend">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[11px]">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.dot)} />
          <span className="font-medium text-foreground">{item.label}</span>
          <span className="truncate text-muted-foreground">{item.meaning}</span>
        </li>
      ))}
    </ul>
  );
}
