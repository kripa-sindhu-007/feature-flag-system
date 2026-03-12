"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface BetaDashboardProps {
  isEnabled: boolean;
}

export function BetaDashboard({ isEnabled }: BetaDashboardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Beta Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {isEnabled ? (
            <motion.div
              key="enabled"
              variants={featureReveal}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={defaultTransition}
              className="space-y-3 rounded-md border bg-card p-4"
            >
              <p className="text-sm font-medium">Beta Analytics Panel</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded bg-primary/10 p-2 text-center">
                  <p className="text-lg font-bold">1.2k</p>
                  <p className="text-xs text-muted-foreground">Users</p>
                </div>
                <div className="rounded bg-primary/10 p-2 text-center">
                  <p className="text-lg font-bold">89%</p>
                  <p className="text-xs text-muted-foreground">Uptime</p>
                </div>
                <div className="rounded bg-primary/10 p-2 text-center">
                  <p className="text-lg font-bold">42ms</p>
                  <p className="text-xs text-muted-foreground">Latency</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="disabled"
              variants={featureReveal}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={defaultTransition}
              className="rounded-md bg-gray-100 p-4 dark:bg-gray-800"
            >
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Beta dashboard is hidden
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Enable this flag to show the analytics panel.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
