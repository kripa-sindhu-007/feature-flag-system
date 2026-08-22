"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GLOSSARY_BY_ID } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * An inline glossary term: a dotted underline that shows the short definition on
 * hover/focus and links to its entry on /glossary. Always renders (it's plain
 * jargon help, not the guide layer), so it works with Explain on or off.
 */
export function Term({
  name,
  children,
  className,
}: {
  /** Glossary entry id (see lib/glossary.ts). */
  name: string;
  /** Display text; defaults to the entry's term. */
  children?: ReactNode;
  className?: string;
}) {
  const entry = GLOSSARY_BY_ID[name];
  const label = children ?? entry?.term ?? name;

  if (!entry) {
    // Unknown term — render text, don't break the page.
    return <span className={className}>{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={`/glossary#${entry.id}`}
            className={cn(
              "underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:decoration-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              className
            )}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{entry.short}</TooltipContent>
    </Tooltip>
  );
}
