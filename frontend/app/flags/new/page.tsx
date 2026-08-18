"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { FlagForm } from "@/components/flags/FlagForm";
import { useCreateFlag } from "@/hooks/useFlags";
import { CreateFlagInput } from "@/types/flag";
import { toast } from "sonner";

export default function NewFlagPage() {
  const router = useRouter();
  const createFlag = useCreateFlag();

  const handleSubmit = (data: CreateFlagInput) => {
    createFlag.mutate(data, {
      onSuccess: () => {
        toast.success("Flag created");
        router.push("/flags");
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/flags"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Flags
        </Link>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
          New flag
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a new feature flag and its rollout.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <FlagForm onSubmit={handleSubmit} isLoading={createFlag.isPending} />
      </div>
    </div>
  );
}
