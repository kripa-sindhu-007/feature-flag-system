import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The explanation-first page header: a plain-English title + a one-line subtitle,
 * and (optionally) one big status line that answers "what's happening now" in
 * words. Replaces/augments the previous terse per-page headers.
 */
export function PageIntro({
  title,
  subtitle,
  status,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  /** One prominent, plain-English status line (real data). Optional. */
  status?: ReactNode;
  /** Trailing header actions (buttons, links). Optional. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {status && (
        <p
          className="max-w-2xl text-[15px] leading-relaxed text-foreground"
          aria-live="polite"
        >
          {status}
        </p>
      )}
    </div>
  );
}
