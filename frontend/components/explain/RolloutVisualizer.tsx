"use client";

import { useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { evaluate, rolloutBucket, type EvaluableFlag } from "@/lib/evaluate";
import { Term } from "./Term";
import { GuideCallout } from "./GuideCallout";

/**
 * The rollout visualizer — the interactive answer to "which users does 25%
 * actually include, and why is it stable?".
 *
 * 100 real sample users (`user-1`…`user-100`), each placed by their REAL fixed
 * hash bucket for this flag (sorted ascending, so raising the % fills the grid
 * like a meter). Every cell's colour is the real `evaluate()` verdict — targeting
 * included. Drag the % to explore *hypothetically*: this never writes to the flag
 * (the real editor lives in the flag form); the maths shown is the same maths the
 * SDK ships, just asked "what if the rollout were N%?".
 *
 * The determinism "aha": cells flip **in place** as you drag — a user never moves,
 * because their dice roll is fixed. Click any user to see the roll.
 */

const GRID = 10; // 10 × 10 = 100 sample users
const SAMPLE = Array.from({ length: GRID * GRID }, (_, i) => `user-${i + 1}`);

type CellState = "on-rollout" | "on-targeted" | "off";

interface Cell {
  user: string;
  bucket: number;
}

export function RolloutVisualizer({
  flag,
  highlightUser,
  className,
}: {
  /** The real flag whose key + targeting drive the buckets. */
  flag: EvaluableFlag;
  /** Optional user to spotlight in the grid (e.g. the demo's current user). */
  highlightUser?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  // Explore percentage — starts at the flag's real value; locally adjustable for
  // what-if exploration. When the underlying flag's real rollout changes (e.g. a
  // saved edit, or the Playground builder), re-sync so the grid follows the real
  // value instead of getting stuck on a stale explore value.
  const [pct, setPct] = useState(flag.rollout_percentage);
  const [prevFlagPct, setPrevFlagPct] = useState(flag.rollout_percentage);
  if (flag.rollout_percentage !== prevFlagPct) {
    setPrevFlagPct(flag.rollout_percentage);
    setPct(flag.rollout_percentage);
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Buckets depend only on (flag key, user), so they're stable across % drags —
  // that's the whole point. Sort once, ascending, so the grid fills like a meter.
  const cells = useMemo<Cell[]>(() => {
    return SAMPLE.map((user) => ({
      user,
      bucket: rolloutBucket(flag.key, user),
    })).sort((a, b) => a.bucket - b.bucket || (a.user < b.user ? -1 : 1));
  }, [flag.key]);

  const explored: EvaluableFlag = { ...flag, rollout_percentage: pct };

  const stateOf = (cell: Cell): CellState => {
    // Use the full evaluator so targeting + the kill switch are honestly reflected.
    const t = evaluate(explored, cell.user);
    if (!t.on) return "off";
    return t.reason === "targeted" ? "on-targeted" : "on-rollout";
  };

  const onCount = cells.filter((c) => stateOf(c) !== "off").length;
  const actualPct = flag.rollout_percentage;
  const dirty = pct !== actualPct;

  // Roving tabindex: one cell in the tab order at a time; arrows move focus.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const cols = GRID;
    let next = focusIdx;
    if (e.key === "ArrowRight") next = Math.min(focusIdx + 1, cells.length - 1);
    else if (e.key === "ArrowLeft") next = Math.max(focusIdx - 1, 0);
    else if (e.key === "ArrowDown") next = Math.min(focusIdx + cols, cells.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(focusIdx - cols, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = cells.length - 1;
    else return;
    e.preventDefault();
    setFocusIdx(next);
    const el = gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-cell]")[next];
    el?.focus();
  };

  const selectedCell = cells.find((c) => c.user === selected) ?? null;

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-5", className)}
      aria-label="Rollout visualizer"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Who gets it at{" "}
          <span className="font-mono tabular-nums text-primary">{pct}%</span>?
        </h3>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {onCount} of {cells.length} sample users on
        </p>
      </div>

      <GuideCallout className="mt-3">
        Each square is a user. Drag the slider — squares flip on or off{" "}
        <em>in place</em>, never reshuffling, because every user has one fixed{" "}
        <Term name="hash-bucket">dice roll</Term>. That&apos;s{" "}
        <Term name="determinism">determinism</Term>: the same person always lands
        on the same side. Click any square to see its roll.
      </GuideCallout>

      {/* The grid */}
      <div
        ref={gridRef}
        role="group"
        aria-label={`${cells.length} sample users, ${onCount} currently on at ${pct} percent. Use arrow keys to move between users, Enter to inspect.`}
        onKeyDown={onGridKeyDown}
        className="mt-4 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => {
          const state = stateOf(cell);
          const isSel = cell.user === selected;
          const isHighlight = cell.user === highlightUser;
          return (
            <button
              key={cell.user}
              type="button"
              data-cell
              data-state={state}
              tabIndex={i === focusIdx ? 0 : -1}
              onFocus={() => setFocusIdx(i)}
              onClick={() => setSelected(isSel ? null : cell.user)}
              aria-pressed={isSel}
              aria-label={`${cell.user}: bucket ${cell.bucket}, ${state === "off" ? "off" : "on"}${
                state === "on-targeted" ? " (targeted)" : ""
              }${isHighlight ? ", current user" : ""}`}
              title={`${cell.user} · bucket ${cell.bucket}`}
              className={cn(
                "relative aspect-square rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                !reduceMotion && "transition-colors duration-200",
                state === "on-rollout" && "bg-primary",
                state === "on-targeted" &&
                  "bg-primary ring-2 ring-inset ring-warning",
                state === "off" && "bg-muted",
                isSel && "outline-2 outline-offset-2 outline-foreground",
                isHighlight && "ring-2 ring-offset-1 ring-offset-card ring-foreground"
              )}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <Legend swatch="bg-primary" label="On (in rollout)" />
        <Legend swatch="bg-primary ring-2 ring-inset ring-warning" label="On (targeted — overrides %)" />
        <Legend swatch="bg-muted" label="Off" />
        {highlightUser && (
          <Legend swatch="bg-transparent ring-2 ring-foreground" label={`Current user (${highlightUser})`} />
        )}
      </div>

      {/* Slider — clearly a what-if explorer, not the real editor. */}
      <div className="mt-5 space-y-2">
        <div className="flex items-center gap-4">
          <Slider
            value={[pct]}
            onValueChange={(v) => setPct(Array.isArray(v) ? v[0] : (v as number))}
            min={0}
            max={100}
            step={1}
            className="flex-1"
            aria-label="Explore rollout percentage"
          />
          <span className="w-14 shrink-0 rounded-md border border-border bg-muted py-1 text-center font-mono text-sm font-medium tabular-nums text-foreground">
            {pct}%
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Exploring hypothetically — this doesn&apos;t change the flag.{" "}
            <span className="text-foreground/70">Actual rollout: </span>
            <span className="font-mono tabular-nums text-foreground/70">{actualPct}%</span>
          </span>
          {dirty && (
            <button
              type="button"
              onClick={() => setPct(actualPct)}
              className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Reset to actual
            </button>
          )}
        </div>
      </div>

      {/* Selected user's real roll */}
      {selectedCell && (
        <SelectedRoll
          flag={explored}
          user={selectedCell.user}
          bucket={selectedCell.bucket}
        />
      )}
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[3px]", swatch)} aria-hidden />
      {label}
    </span>
  );
}

function SelectedRoll({
  flag,
  user,
  bucket,
}: {
  flag: EvaluableFlag;
  user: string;
  bucket: number;
}) {
  const t = evaluate(flag, user);
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <p className="font-mono text-xs text-muted-foreground">
        fnv1a32(&quot;{t.hashInput}&quot;) % 100
      </p>
      <p className="mt-1 font-mono tabular-nums text-foreground">
        = <span className="text-primary">{bucket}</span>
        {t.reason === "targeted" ? (
          <span className="text-muted-foreground">
            {"  "}→ but <span className="text-warning">{user}</span> is targeted →{" "}
            <span className="font-semibold text-success">ON</span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            {"  "}→ {bucket} &lt; {flag.rollout_percentage}?{" "}
            {t.on ? (
              <span className="font-semibold text-success">yes → ON</span>
            ) : (
              <span className="font-semibold text-muted-foreground">no → OFF</span>
            )}
          </span>
        )}
      </p>
    </div>
  );
}
