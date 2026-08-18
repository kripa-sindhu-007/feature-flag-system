"use client";

import { Moon } from "lucide-react";
import { FeatureCard } from "./FeatureCard";

export function DarkModeFeature({ isEnabled }: { isEnabled: boolean }) {
  return (
    <FeatureCard
      icon={Moon}
      title="Dark mode"
      flagKey="dark-mode"
      isEnabled={isEnabled}
      disabledHint="Enable this flag to switch this user to the dark theme."
      enabledContent={
        <div className="rounded-lg border border-border bg-[#0b0b10] p-4">
          <p className="text-sm font-medium text-white">Dark mode is active</p>
          <p className="mt-1 text-xs text-white/60">
            The UI renders in dark theme for this user.
          </p>
        </div>
      }
    />
  );
}
