"use client";

import { Switch } from "@/components/ui/switch";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function ToggleSwitch({ enabled, onToggle, disabled }: ToggleSwitchProps) {
  return (
    <Switch
      checked={enabled}
      onCheckedChange={onToggle}
      disabled={disabled}
      aria-label={enabled ? "Disable flag" : "Enable flag"}
    />
  );
}
