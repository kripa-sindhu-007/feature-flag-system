"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface AiAssistantProps {
  isEnabled: boolean;
}

export function AiAssistant({ isEnabled }: AiAssistantProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" />
          AI Assistant
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
              <div className="space-y-2">
                <div className="rounded-lg bg-muted p-2 text-sm">
                  <p className="font-medium">AI Assistant</p>
                  <p className="text-muted-foreground">
                    Hello! How can I help you today?
                  </p>
                </div>
                <div className="ml-8 rounded-lg bg-primary/10 p-2 text-sm">
                  <p>Tell me about feature flags</p>
                </div>
                <div className="rounded-lg bg-muted p-2 text-sm">
                  <p className="text-muted-foreground">
                    Feature flags are a way to toggle functionality on or off
                    without deploying new code...
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Type a message..." disabled />
                <Button size="sm" disabled>
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
              className="rounded-md bg-gray-100 p-4 dark:bg-gray-800"
            >
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                AI assistant is hidden
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Enable this flag to show the AI chat widget.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
