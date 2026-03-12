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
import { Plus } from "lucide-react";
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
        <p className="text-muted-foreground">Loading flags...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <Link href="/flags/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Flag
          </Button>
        </Link>
      </div>

      {!flags?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <p className="text-muted-foreground">No flags yet</p>
          <Link href="/flags/new">
            <Button variant="link">Create your first flag</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rollout</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/flags/${flag.id}`}
                        className="hover:underline"
                      >
                        {flag.key}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="line-clamp-1 max-w-50" />}
                        >
                          {flag.description || "—"}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{flag.description || "No description"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Badge variant={flag.enabled ? "default" : "secondary"}>
                        {flag.enabled ? "ON" : "OFF"}
                      </Badge>
                    </TableCell>
                    <TableCell>{flag.rollout_percentage}%</TableCell>
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
