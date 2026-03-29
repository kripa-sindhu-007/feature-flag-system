"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface AiAssistantProps {
  isEnabled: boolean;
}

export function AiAssistant({ isEnabled }: AiAssistantProps) {
  return (
    <Card className="group relative overflow-hidden border-border/50 transition-all duration-300 hover:border-sakura/30 hover:shadow-lg hover:shadow-sakura/5">
      <div className="anime-corner pointer-events-none absolute inset-0" />
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wider">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sakura/15">
              <Bot className="h-4 w-4 text-sakura" />
            </div>
            AI Assistant
          </CardTitle>
          <p className="mt-1 pl-[42px] font-mono text-[10px] text-muted-foreground">
            ai-assistant
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
              className="space-y-3 rounded-lg border border-sakura/20 bg-sakura/5 p-4"
            >
              <div className="space-y-2">
                <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sakura">AI Assistant</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hello! How can I help you today?
                  </p>
                </div>
                <div className="ml-8 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
                  <p>Tell me about feature flags</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Feature flags are a way to toggle functionality on or off
                    without deploying new code...
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Type a message..." disabled className="text-xs" />
                <Button size="sm" disabled className="font-semibold uppercase tracking-wider text-xs">
                  Send
                </Button>
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
                AI assistant is hidden
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Enable this flag to show the AI chat widget.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
