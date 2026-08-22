"use client";

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useExplain } from "./ExplainProvider";
import { cn } from "@/lib/utils";

/**
 * The guide voice, rendered as a consistent indigo callout (small icon + subtle
 * left accent) — the one "the app is explaining itself" layer. Distinct from
 * neutral tooltips by the indigo left accent + tint. Hidden entirely when the
 * Explain toggle is OFF (pro view). Copy should follow the guide charter:
 * present tense, second person, one idea per sentence, concept + analogy + why.
 */
export function GuideCallout({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** Optional short lead-in, e.g. "Percentage rollout". */
  title?: string;
}) {
  const { explain } = useExplain();
  if (!explain) return null;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-primary/20 border-l-2 border-l-primary bg-primary/[0.06] px-4 py-3",
        className
      )}
      role="note"
    >
      <Sparkles
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 text-sm leading-relaxed text-foreground/90">
        {title && (
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            {title}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
