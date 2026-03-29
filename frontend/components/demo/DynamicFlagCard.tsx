"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface DynamicFlagCardProps {
  flagKey: string;
  isEnabled: boolean;
  description?: string;
}

export function DynamicFlagCard({
  flagKey,
  isEnabled,
  description,
}: DynamicFlagCardProps) {
  return (
    <Card className="group relative overflow-hidden border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
      <div className="anime-corner pointer-events-none absolute inset-0" />
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wider">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              {flagKey}
            </CardTitle>
            <p className="mt-1 pl-[42px] font-mono text-[10px] text-muted-foreground">
              {flagKey}
            </p>
          </div>
          {isEnabled ? (
            <Badge className="anime-status-on border-0 text-[10px] font-bold uppercase tracking-widest">ON</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">OFF</Badge>
          )}
        </div>
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
              className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-4"
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-neon-cyan">
                Feature enabled
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {description || "This feature is currently enabled for you."}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="disabled"
              variants={featureReveal}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={defaultTransition}
              className="rounded-lg border border-border/50 bg-muted/30 p-4"
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Feature disabled
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {description || "This feature is not currently available for you."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
