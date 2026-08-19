"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FlagForm } from "@/components/flags/FlagForm";
import { StatusBadge } from "@/components/flags/StatusBadge";
import { FlagHistoryDrawer } from "@/components/flags/FlagHistoryDrawer";
import { useFlag, useUpdateFlag, useDeleteFlag } from "@/hooks/useFlags";
import { UpdateFlagInput } from "@/types/flag";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function FlagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: flag, isLoading } = useFlag(id);
  const updateFlag = useUpdateFlag();
  const deleteFlag = useDeleteFlag();

  const handleSubmit = (data: UpdateFlagInput) => {
    updateFlag.mutate(
      { id, input: data, expectedVersion: flag?.version },
      {
        onSuccess: () => toast.success("Flag updated"),
        onError: (error) => {
          toast.error(error.message);
          // Re-sync to the latest version so a retry carries the new If-Match.
          queryClient.invalidateQueries({ queryKey: ["flags", id] });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteFlag.mutate(id, {
      onSuccess: () => {
        toast.success("Flag deleted");
        router.push("/flags");
      },
      onError: (error) => toast.error(error.message),
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!flag) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">Flag not found</p>
        <Button
          variant="link"
          nativeButton={false}
          render={<Link href="/flags" />}
          className="mt-1"
        >
          Back to flags
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/flags"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Flags
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate font-mono text-xl font-semibold tracking-tight text-foreground">
                {flag.key}
              </h2>
              <StatusBadge enabled={flag.enabled} />
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                v{flag.version}
              </span>
            </div>
            {flag.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {flag.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <FlagHistoryDrawer flagId={id} />
            <Dialog>
            <DialogTrigger
              render={<Button variant="destructive" size="sm" />}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete flag?</DialogTitle>
                <DialogDescription>
                  This permanently deletes{" "}
                  <span className="font-mono text-foreground">{flag.key}</span>.
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteFlag.isPending}
                >
                  {deleteFlag.isPending ? "Deleting…" : "Delete flag"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="rounded-lg border border-border bg-card p-6">
        <FlagForm
          flag={flag}
          onSubmit={handleSubmit}
          isLoading={updateFlag.isPending}
        />
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>
          Created{" "}
          <span className="font-mono text-foreground/80">
            {new Date(flag.created_at).toLocaleString()}
          </span>
        </span>
        <span>
          Updated{" "}
          <span className="font-mono text-foreground/80">
            {new Date(flag.updated_at).toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  );
}
