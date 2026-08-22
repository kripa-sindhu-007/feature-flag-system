"use client";

import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExplain } from "./ExplainProvider";
import { cn } from "@/lib/utils";

/**
 * The one switch that flips the whole app between teaching (Explain ON — guide
 * callouts shown, dense detail collapsed) and pro (OFF — callouts hidden, detail
 * expanded). Persisted; default ON.
 */
export function ExplainToggle() {
  const { explain, toggleExplain } = useExplain();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            role="switch"
            aria-checked={explain}
            aria-label="Explain mode"
            onClick={toggleExplain}
            className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <Sparkles
          className={cn(
            "h-3.5 w-3.5",
            explain ? "text-primary" : "text-muted-foreground"
          )}
          strokeWidth={2}
          aria-hidden
        />
        <span
          className={cn(
            "hidden sm:inline",
            explain ? "text-foreground" : "text-muted-foreground"
          )}
        >
          Explain
        </span>
        {/* Decorative track (the button itself is the switch) */}
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-[14px] w-6 shrink-0 items-center rounded-full transition-colors",
            explain ? "bg-primary" : "bg-input"
          )}
        >
          <span
            className={cn(
              "block h-3 w-3 rounded-full bg-background transition-transform",
              explain ? "translate-x-[11px]" : "translate-x-[1px]"
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {explain
          ? "Explain is on — guide notes shown, dense detail tucked away. Click for the pro view."
          : "Explain is off — pro view. Click to bring back the guided explanations."}
      </TooltipContent>
    </Tooltip>
  );
}
