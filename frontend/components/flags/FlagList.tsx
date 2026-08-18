"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Flag as FlagIcon, Users, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { RolloutBar } from "./RolloutBar";
import { ToggleSwitch } from "./ToggleSwitch";
import { useFlags, useToggleFlag } from "@/hooks/useFlags";
import { useSSE } from "@/hooks/useSSE";

export function FlagList() {
  const { data: flags, isLoading, isError } = useFlags();
  const toggleFlag = useToggleFlag();
  useSSE();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Feature flags
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {flags?.length ?? 0} flag{flags?.length === 1 ? "" : "s"} · evaluated
            locally, propagated in real time
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/flags/new" />}>
          <Plus className="h-4 w-4" />
          New flag
        </Button>
      </div>

      {/* States */}
      {isError ? (
        <ErrorState />
      ) : isLoading ? (
        <SkeletonTable />
      ) : !flags?.length ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <Th>Status</Th>
                  <Th>Key</Th>
                  <Th className="hidden md:table-cell">Description</Th>
                  <Th className="hidden sm:table-cell">Rollout</Th>
                  <Th className="hidden sm:table-cell">Targeting</Th>
                  <Th className="text-right">Enabled</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow
                    key={flag.id}
                    className="group border-border transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <StatusBadge enabled={flag.enabled} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/flags/${flag.id}`}
                        className="inline-flex max-w-[42vw] items-center gap-1 truncate font-mono text-sm font-medium text-foreground hover:text-primary sm:max-w-none"
                      >
                        <span className="truncate">{flag.key}</span>
                        <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:inline" />
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="line-clamp-1 max-w-xs text-sm text-muted-foreground" />
                          }
                        >
                          {flag.description || "—"}
                        </TooltipTrigger>
                        {flag.description && (
                          <TooltipContent className="max-w-xs">
                            {flag.description}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <RolloutBar
                        percentage={flag.rollout_percentage}
                        active={flag.enabled}
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {flag.targeted_users.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span className="font-mono tabular-nums">
                            {flag.targeted_users.length}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ToggleSwitch
                        enabled={flag.enabled}
                        onToggle={() => toggleFlag.mutate(flag.id)}
                        disabled={toggleFlag.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={`h-9 text-xs font-medium uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </TableHead>
  );
}

function SkeletonTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
        <FlagIcon className="h-5 w-5 text-muted-foreground" />
      </span>
      <p className="mt-4 text-sm font-medium text-foreground">No flags yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your first flag to start rolling out features.
      </p>
      <Button
        className="mt-4"
        nativeButton={false}
        render={<Link href="/flags/new" />}
      >
        <Plus className="h-4 w-4" />
        New flag
      </Button>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
      <p className="text-sm font-medium text-destructive">
        Couldn&apos;t reach the control plane
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Check that the API is running on :8080, then retry.
      </p>
    </div>
  );
}
