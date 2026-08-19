"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { History, X, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlagHistory } from "@/hooks/useFlags";
import { FlagEvent } from "@/types/flag";
import { cn } from "@/lib/utils";

const EVENT_META: Record<
  FlagEvent["event_type"],
  { label: string; icon: typeof Plus; tone: string }
> = {
  created: { label: "Created", icon: Plus, tone: "text-success" },
  updated: { label: "Updated", icon: Pencil, tone: "text-primary" },
  deleted: { label: "Deleted", icon: Trash2, tone: "text-destructive" },
};

export function FlagHistoryDrawer({ flagId }: { flagId: string }) {
  const [open, setOpen] = useState(false);
  const { data: events, isLoading } = useFlagHistory(flagId, open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={<Button variant="secondary" size="sm" />}
      >
        <History className="h-4 w-4" />
        History
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/50 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-border bg-background shadow-xl duration-200 outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Change history
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                From the durable event log — newest first.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon" aria-label="Close" />}
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : !events?.length ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {events.map((e) => (
                  <EventRow key={e.version} event={e} />
                ))}
              </ol>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EventRow({ event }: { event: FlagEvent }) {
  const meta = EVENT_META[event.event_type] ?? EVENT_META.updated;
  const Icon = meta.icon;
  const enabled = event.payload?.enabled as boolean | undefined;
  const rollout = event.payload?.rollout_percentage as number | undefined;

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background",
          meta.tone
        )}
      >
        <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-medium", meta.tone)}>
          {meta.label}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          v{event.version}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
        {new Date(event.created_at).toLocaleString()}
      </p>
      {event.event_type !== "deleted" &&
        (enabled !== undefined || rollout !== undefined) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled !== undefined && (
              <span>{enabled ? "enabled" : "disabled"}</span>
            )}
            {rollout !== undefined && <span> · {rollout}% rollout</span>}
          </p>
        )}
    </li>
  );
}
