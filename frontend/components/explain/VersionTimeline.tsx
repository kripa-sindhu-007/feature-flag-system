"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useEvents } from "@/hooks/useEvents";
import type { FlagEvent } from "@/types/flag";
import { Term } from "./Term";

/**
 * A horizontal history of the global config version — one tick per entry in the
 * durable flag-events log (the real source of truth, not the ephemeral stream).
 * Oldest on the left, newest on the right; click a tick to read what changed.
 * This is the "save points" view: every version is a durable, ordered save.
 */

type Kind = FlagEvent["event_type"];

const KIND_STYLE: Record<Kind, { dot: string; label: string; badge: string }> = {
  created: {
    dot: "bg-primary border-primary",
    label: "created",
    badge: "bg-primary/10 text-primary",
  },
  updated: {
    dot: "bg-foreground border-foreground",
    label: "updated",
    badge: "bg-muted text-foreground/80",
  },
  deleted: {
    dot: "bg-muted border-muted-foreground",
    label: "deleted",
    badge: "bg-muted text-muted-foreground",
  },
};

export function VersionTimeline({
  latest,
  className,
}: {
  /** Highest known config version (e.g. cluster latest / flags config_version). */
  latest: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { data, isLoading } = useEvents(latest, 40);
  const railRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Ascending by version (oldest → newest) for a natural left-to-right timeline.
  const events = useMemo(
    () => [...(data?.events ?? [])].sort((a, b) => a.version - b.version),
    [data?.events]
  );

  // Keep the newest entry in view as versions arrive.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: reduceMotion ? "auto" : "smooth" });
  }, [events.length, reduceMotion]);

  const selectedEvent = events.find((e) => e.version === selected) ?? null;

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-5", className)}
      aria-label="Version timeline"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Version timeline</h3>
        <p className="text-xs text-muted-foreground">
          The durable <Term name="event-log">event log</Term> as{" "}
          <Term name="versioning">save points</Term> — newest on the right.
        </p>
      </div>

      {isLoading && events.length === 0 ? (
        <div className="mt-5 h-16 animate-pulse rounded-md bg-muted" />
      ) : events.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No changes recorded yet. Flip a flag and it&apos;ll appear here as a new
          version.
        </p>
      ) : (
        <div
          ref={railRef}
          className="mt-5 overflow-x-auto pb-2"
          tabIndex={0}
          role="group"
          aria-label="Version history, oldest to newest. Scroll horizontally."
        >
          <div className="flex min-w-full items-stretch gap-0">
            {events.map((e, i) => (
              <TimelineTick
                key={e.version}
                event={e}
                first={i === 0}
                selected={e.version === selected}
                onSelect={() =>
                  setSelected((v) => (v === e.version ? null : e.version))
                }
              />
            ))}
          </div>
        </div>
      )}

      {selectedEvent && <Detail event={selectedEvent} />}
    </section>
  );
}

function TimelineTick({
  event,
  first,
  selected,
  onSelect,
}: {
  event: FlagEvent;
  first: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = KIND_STYLE[event.event_type];
  return (
    <div className="flex min-w-[7.5rem] flex-col items-center">
      {/* connector + dot */}
      <div className="flex w-full items-center" aria-hidden>
        <span className={cn("h-px flex-1", first ? "bg-transparent" : "bg-border")} />
        <span className={cn("h-2.5 w-2.5 rounded-full border", style.dot)} />
        <span className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Version ${event.version}: ${event.flag_key} ${style.label}`}
        className={cn(
          "mt-2 flex w-[7rem] flex-col items-center gap-1 rounded-md border px-2 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          selected
            ? "border-primary bg-primary/5"
            : "border-transparent hover:border-border hover:bg-muted/50"
        )}
      >
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          v{event.version}
        </span>
        <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
          {event.flag_key}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", style.badge)}>
          {style.label}
        </span>
        <RelTime iso={event.created_at} />
      </button>
    </div>
  );
}

function Detail({ event }: { event: FlagEvent }) {
  const p = event.payload as {
    enabled?: boolean;
    rollout_percentage?: number;
    targeted_users?: string[];
  };
  const isDelete = event.event_type === "deleted";
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">
        <span className="font-mono">v{event.version}</span> ·{" "}
        <span className="font-mono">{event.flag_key}</span> {event.event_type}
      </p>
      <p className="mt-1 text-muted-foreground">
        {isDelete ? (
          "The flag was removed. Clients drop it and evaluate it as off."
        ) : (
          <>
            Now{" "}
            <span
              className={cn(
                "font-medium",
                p.enabled ? "text-success" : "text-foreground"
              )}
            >
              {p.enabled ? "ON" : "OFF"}
            </span>
            {typeof p.rollout_percentage === "number" && (
              <>
                {" "}
                at{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {p.rollout_percentage}%
                </span>{" "}
                rollout
              </>
            )}
            {p.targeted_users && p.targeted_users.length > 0 && (
              <>
                {" · "}
                {p.targeted_users.length} targeted user
                {p.targeted_users.length > 1 ? "s" : ""}
              </>
            )}
            .
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground/80">
        {new Date(event.created_at).toLocaleString()}
      </p>
    </div>
  );
}

function RelTime({ iso }: { iso: string }) {
  // Keep Date.now() out of render (strict react-hooks/purity): seed it lazily and
  // refresh on an interval, then derive the label from that state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - then) / 1000));
  const label =
    s < 60
      ? `${s}s ago`
      : s < 3600
        ? `${Math.floor(s / 60)}m ago`
        : s < 86400
          ? `${Math.floor(s / 3600)}h ago`
          : `${Math.floor(s / 86400)}d ago`;
  return <span className="text-[10px] tabular-nums text-muted-foreground/70">{label}</span>;
}
