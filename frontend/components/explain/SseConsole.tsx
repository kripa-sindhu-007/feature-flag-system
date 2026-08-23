"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Pause, Play, Trash2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Term } from "./Term";
import { GuideCallout } from "./GuideCallout";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

/**
 * A human-readable window on the *real* SSE stream. It opens a plain
 * `EventSource` to the load balancer and turns each `flag_updated` /
 * `flag_deleted` frame into one sentence — "v2254 · checkout → ON · 50% rollout".
 * Nothing here is synthesized: every line is a frame the server actually pushed,
 * stamped with the moment this browser received it.
 *
 * `compact` renders a shorter, chrome-light version for the Overview.
 */

type EntryKind = "on" | "off" | "deleted";

interface Entry {
  seq: number;
  version: number;
  key: string;
  kind: EntryKind;
  rollout: number | null;
  at: number; // ms epoch, client-observed arrival
}

type Conn = "connecting" | "live" | "down";

const MAX_FULL = 60;
const MAX_COMPACT = 6;

export function SseConsole({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const seqRef = useRef(0);
  const max = compact ? MAX_COMPACT : MAX_FULL;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/client/stream?key=${SDK_KEY}`);

    es.onopen = () => setConn("live");
    es.onerror = () => setConn((c) => (c === "live" ? "down" : "connecting"));

    const push = (kind: EntryKind, e: MessageEvent) => {
      if (pausedRef.current) return;
      const version = parseInt(e.lastEventId, 10);
      let key = "(unknown)";
      let enabled = false;
      let rollout: number | null = null;
      try {
        const d = JSON.parse(e.data) as {
          key?: string;
          enabled?: boolean;
          rollout_percentage?: number;
        };
        if (d.key) key = d.key;
        enabled = !!d.enabled;
        rollout =
          typeof d.rollout_percentage === "number" ? d.rollout_percentage : null;
      } catch {
        /* ignore malformed frame */
      }
      const resolvedKind: EntryKind =
        kind === "deleted" ? "deleted" : enabled ? "on" : "off";
      const entry: Entry = {
        seq: seqRef.current++,
        version: Number.isFinite(version) ? version : 0,
        key,
        kind: resolvedKind,
        rollout: resolvedKind === "on" ? rollout : null,
        at: Date.now(),
      };
      setEntries((prev) => [entry, ...prev].slice(0, max));
    };

    const onUpdate = (e: MessageEvent) => push("on", e);
    const onDelete = (e: MessageEvent) => push("deleted", e);
    es.addEventListener("flag_updated", onUpdate);
    es.addEventListener("flag_deleted", onDelete);

    return () => {
      es.removeEventListener("flag_updated", onUpdate);
      es.removeEventListener("flag_deleted", onDelete);
      es.close();
    };
  }, [max]);

  return (
    <section
      className={cn("rounded-lg border border-border bg-card", className)}
      aria-label="Live event stream"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">Live event stream</h3>
          <ConnPill conn={conn} />
        </div>
        {!compact && (
          <div className="flex items-center gap-1">
            <IconBtn
              label={paused ? "Resume feed" : "Pause feed"}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn label="Clear feed" onClick={() => setEntries([])}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}
      </div>

      {!compact && (
        <GuideCallout className="m-3">
          This is the actual{" "}
          <Term name="sse">server-sent event</Term> stream — the same push the
          SDK listens to. Change a flag anywhere and its new{" "}
          <Term name="config-version">version</Term> shows up here within
          milliseconds, in plain words. Try flipping the hero above.
        </GuideCallout>
      )}

      <ol
        role="log"
        aria-label="Live flag events, newest first"
        aria-live="polite"
        className={cn(
          "divide-y divide-border/60 overflow-y-auto px-1 py-1 font-mono text-xs",
          compact ? "max-h-44" : "max-h-80"
        )}
      >
        {entries.length === 0 ? (
          <li className="px-3 py-6 text-center font-sans text-sm text-muted-foreground">
            {conn === "down"
              ? "Stream disconnected — is the stack running on :8080?"
              : "Waiting for the next change… flip a flag to see it appear here live."}
          </li>
        ) : (
          entries.map((e) => (
            <EntryRow key={e.seq} entry={e} reduceMotion={reduceMotion} />
          ))
        )}
      </ol>
    </section>
  );
}

function EntryRow({ entry, reduceMotion }: { entry: Entry; reduceMotion: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5",
        !reduceMotion && "flagplane-pop"
      )}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        v{entry.version}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{entry.key}</span>
      <Verdict entry={entry} />
      <RelTime at={entry.at} />
    </li>
  );
}

function Verdict({ entry }: { entry: Entry }) {
  if (entry.kind === "deleted") {
    return (
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        deleted
      </span>
    );
  }
  const on = entry.kind === "on";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-semibold",
          on ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        )}
      >
        {on ? "ON" : "OFF"}
      </span>
      {on && entry.rollout !== null && entry.rollout < 100 && (
        <span className="text-[11px] text-muted-foreground">{entry.rollout}%</span>
      )}
    </span>
  );
}

/** Client-observed arrival time, shown as a coarse relative label. */
function RelTime({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - at) / 1000));
  const label = s < 2 ? "now" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  return (
    <span
      className="w-8 shrink-0 text-right tabular-nums text-muted-foreground/70"
      title={new Date(at).toLocaleTimeString()}
    >
      {label}
    </span>
  );
}

function ConnPill({ conn }: { conn: Conn }) {
  const meta =
    conn === "live"
      ? { dot: "text-success fill-success", text: "live", cls: "text-success" }
      : conn === "down"
        ? { dot: "text-destructive fill-destructive", text: "down", cls: "text-destructive" }
        : { dot: "text-warning fill-warning", text: "connecting", cls: "text-warning" };
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] font-medium", meta.cls)}
      aria-live="polite"
    >
      <Circle className={cn("h-2 w-2", meta.dot)} aria-hidden />
      {meta.text}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
