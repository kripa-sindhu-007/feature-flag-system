"use client";

import { Zap } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

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
    <FeatureCard
      icon={Zap}
      title={flagKey}
      flagKey={flagKey}
      isEnabled={isEnabled}
      disabledHint={description || "This feature is not available for this user."}
      enabledContent={
        <div className="rounded-lg border border-success/30 bg-success/10 p-4">
          <p className="text-sm font-medium text-success">Enabled for this user</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {description || "This feature is currently enabled for you."}
          </p>
        </div>
      }
    />
  );
}
