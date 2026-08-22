"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useExplain } from "./ExplainProvider";
import { cn } from "@/lib/utils";

/**
 * A disclosure wrapper for dense operator detail (tiles, raw numbers, node
 * grids). Its default open/closed state is driven by the Explain toggle:
 * Explain ON (teaching) → collapsed by default; Explain OFF (pro) → expanded.
 * The user can still open/close it manually afterwards; flipping the global
 * toggle resets it to the matching default.
 */
export function AdvancedDetails({
  children,
  label = "Advanced details",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const { explain } = useExplain();
  const [open, setOpen] = useState(!explain);

  // Follow the global toggle: teaching collapses, pro expands. Manual toggles
  // afterwards are respected until the global toggle changes again. Adjusting
  // state during render on a prop change is React's recommended pattern (no
  // effect + setState churn).
  const [prevExplain, setPrevExplain] = useState(explain);
  if (explain !== prevExplain) {
    setPrevExplain(explain);
    setOpen(!explain);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
