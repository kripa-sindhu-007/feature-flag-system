"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FlagForm } from "@/components/flags/FlagForm";
import { useFlag, useUpdateFlag, useDeleteFlag } from "@/hooks/useFlags";
import { pageTransition, defaultTransition } from "@/components/motion/variants";
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
  const { data: flag, isLoading } = useFlag(id);
  const updateFlag = useUpdateFlag();
  const deleteFlag = useDeleteFlag();

  const handleSubmit = (data: UpdateFlagInput) => {
    updateFlag.mutate(
      { id, input: data as UpdateFlagInput },
      {
        onSuccess: () => {
          toast.success("Flag updated successfully");
        },
        onError: (error) => {
          toast.error(error.message);
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
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Loading flag...</p>
        </div>
      </div>
    );
  }

  if (!flag) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Flag not found</p>
        <Link href="/flags">
          <Button variant="link" className="mt-2 font-semibold uppercase tracking-wider text-primary">
            Back to flags
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      className="mx-auto max-w-2xl space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/flags">
            <Button variant="ghost" size="icon" className="rounded-lg">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              Edit <span className="text-primary">Flag</span>
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{flag.key}</p>
          </div>
        </div>

        <Dialog>
          <DialogTrigger
            render={<Button variant="destructive" size="sm" className="font-semibold uppercase tracking-wider" />}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-bold uppercase tracking-wider">Delete flag?</DialogTitle>
              <DialogDescription>
                This will permanently delete the flag &quot;{flag.key}&quot;.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteFlag.isPending}
                className="font-semibold uppercase tracking-wider"
              >
                {deleteFlag.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
        <FlagForm
          flag={flag}
          onSubmit={handleSubmit}
          isLoading={updateFlag.isPending}
        />
      </div>
    </motion.div>
  );
}
