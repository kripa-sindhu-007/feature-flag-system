"use client";

import { Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FeatureCard } from "./FeatureCard";

export function AiAssistant({ isEnabled }: { isEnabled: boolean }) {
  return (
    <FeatureCard
      icon={Bot}
      title="AI assistant"
      flagKey="ai-assistant"
      isEnabled={isEnabled}
      disabledHint="Enable this flag to show the AI chat widget for this user."
      enabledContent={
        <div className="space-y-2.5">
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-muted/40 p-2.5">
              <p className="text-xs font-medium text-primary">Assistant</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hello! How can I help you today?
              </p>
            </div>
            <div className="ml-8 rounded-lg border border-primary/25 bg-primary/10 p-2.5">
              <p className="text-xs text-foreground">Tell me about feature flags</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Type a message…" disabled className="h-8 text-xs" />
            <Button size="sm" disabled>
              Send
            </Button>
          </div>
        </div>
      }
    />
  );
}
