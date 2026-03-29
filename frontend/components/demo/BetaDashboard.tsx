"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface BetaDashboardProps {
  isEnabled: boolean;
}

export function BetaDashboard({ isEnabled }: BetaDashboardProps) {
  return (
    <Card className="group relative overflow-hidden border-border/50 transition-all duration-300 hover:border-neon-cyan/30 hover:shadow-lg hover:shadow-neon-cyan/5">
      <div className="anime-corner pointer-events-none absolute inset-0" />
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wider">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-cyan/15">
              <BarChart3 className="h-4 w-4 text-neon-cyan" />
            </div>
            Beta Dashboard
          </CardTitle>
          <p className="mt-1 pl-[42px] font-mono text-[10px] text-muted-foreground">
            beta-dashboard
          </p>
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
              className="space-y-3 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-4"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-neon-cyan">Beta Analytics Panel</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
                  <p className="font-mono text-lg font-bold text-foreground">1.2k</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Users</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
                  <p className="font-mono text-lg font-bold text-foreground">89%</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Uptime</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-3 text-center">
                  <p className="font-mono text-lg font-bold text-foreground">42ms</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Latency</p>
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
              className="rounded-lg border border-border/50 bg-muted/30 p-4"
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Beta dashboard is hidden
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Enable this flag to show the analytics panel.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
