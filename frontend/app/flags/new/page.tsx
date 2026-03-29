"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FlagForm } from "@/components/flags/FlagForm";
import { useCreateFlag } from "@/hooks/useFlags";
import { pageTransition, defaultTransition } from "@/components/motion/variants";
import { CreateFlagInput } from "@/types/flag";
import { toast } from "sonner";

export default function NewFlagPage() {
  const router = useRouter();
  const createFlag = useCreateFlag();

  const handleSubmit = (data: CreateFlagInput) => {
    createFlag.mutate(data as CreateFlagInput, {
      onSuccess: () => {
        toast.success("Flag created successfully");
        router.push("/flags");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      className="mx-auto max-w-2xl space-y-6"
    >
      <div className="flex items-center gap-4">
        <Link href="/flags">
          <Button variant="ghost" size="icon" className="rounded-lg">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider">
            Create <span className="text-primary">Flag</span>
          </h1>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Configure a new feature flag
          </p>
        </div>
        <Sparkles className="ml-auto h-5 w-5 text-primary/30 anime-float" />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
        <FlagForm onSubmit={handleSubmit} isLoading={createFlag.isPending} />
      </div>
    </motion.div>
  );
}
