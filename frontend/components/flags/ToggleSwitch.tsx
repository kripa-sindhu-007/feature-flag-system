"use client";

import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { springTransition } from "@/components/motion/variants";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function ToggleSwitch({ enabled, onToggle, disabled }: ToggleSwitchProps) {
  return (
    <motion.div
      animate={{ scale: enabled ? 1 : 0.95 }}
      transition={springTransition}
    >
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
    </motion.div>
  );
}
