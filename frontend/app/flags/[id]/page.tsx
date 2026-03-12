"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2 } from "lucide-react";
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
        <p className="text-muted-foreground">Loading flag...</p>
      </div>
    );
  }

  if (!flag) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Flag not found</p>
        <Link href="/flags">
          <Button variant="link">Back to flags</Button>
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
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">
            Edit Flag:{" "}
            <span className="font-mono text-muted-foreground">{flag.key}</span>
          </h1>
        </div>

        <Dialog>
          <DialogTrigger
            render={<Button variant="destructive" size="sm" />}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete flag?</DialogTitle>
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
              >
                {deleteFlag.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <FlagForm
        flag={flag}
        onSubmit={handleSubmit}
        isLoading={updateFlag.isPending}
      />
    </motion.div>
  );
}
