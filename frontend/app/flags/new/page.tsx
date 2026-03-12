"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
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
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Create Flag</h1>
      </div>

      <FlagForm onSubmit={handleSubmit} isLoading={createFlag.isPending} />
    </motion.div>
  );
}
