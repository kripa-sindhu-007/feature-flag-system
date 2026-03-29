"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Sparkles } from "lucide-react";
import { ToggleSwitch } from "./ToggleSwitch";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { useFlags, useToggleFlag } from "@/hooks/useFlags";
import { useSSE } from "@/hooks/useSSE";

export function FlagList() {
  const { data: flags, isLoading } = useFlags();
  const toggleFlag = useToggleFlag();
  useSSE();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Loading flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider">
            Feature <span className="text-primary">Flags</span>
          </h1>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {flags?.length || 0} flags registered
          </p>
        </div>
        <Link href="/flags/new">
          <Button className="font-semibold uppercase tracking-wider">
            <Plus className="mr-2 h-4 w-4" />
            Create Flag
          </Button>
        </Link>
      </div>

      {!flags?.length ? (
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/30 py-16">
          <div className="anime-corner pointer-events-none absolute inset-0" />
          <Sparkles className="mb-3 h-8 w-8 text-primary/40" />
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">No flags yet</p>
          <Link href="/flags/new">
            <Button variant="link" className="mt-2 font-semibold uppercase tracking-wider text-primary">
              Create your first flag
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead className="text-[10px] font-bold uppercase tracking-widest">Key</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest">Description</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest">Rollout</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <motion.tbody
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              <AnimatePresence>
                {flags.map((flag) => (
                  <motion.tr
                    key={flag.id}
                    variants={staggerItem}
                    exit={{ opacity: 0, x: -20 }}
                    className="border-b border-border/30 transition-colors hover:bg-primary/[0.03]"
                  >
                    <TableCell className="font-mono text-sm font-semibold">
                      <Link
                        href={`/flags/${flag.id}`}
                        className="transition-colors hover:text-primary hover:underline"
                      >
                        {flag.key}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="line-clamp-1 max-w-50 text-sm text-muted-foreground" />}
                        >
                          {flag.description || "---"}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{flag.description || "No description"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {flag.enabled ? (
                        <Badge className="anime-status-on border-0 text-[10px] font-bold uppercase tracking-widest">
                          ON
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">
                          OFF
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{flag.rollout_percentage}%</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ToggleSwitch
                        enabled={flag.enabled}
                        onToggle={() => toggleFlag.mutate(flag.id)}
                        disabled={toggleFlag.isPending}
                      />
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </motion.tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
