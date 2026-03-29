"use client";

import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleSwitch } from "./ToggleSwitch";
import { scaleOnHover } from "@/components/motion/variants";
import { Flag } from "@/types/flag";

interface FlagCardProps {
  flag: Flag;
  onToggle: () => void;
  onClick: () => void;
}

export function FlagCard({ flag, onToggle, onClick }: FlagCardProps) {
  return (
    <motion.div
      variants={scaleOnHover}
      initial="rest"
      whileHover="hover"
      whileTap="tap"
    >
      <Card
        className="group relative cursor-pointer overflow-hidden border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
        onClick={onClick}
      >
        <div className="anime-corner pointer-events-none absolute inset-0" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="font-mono text-sm font-semibold">{flag.key}</CardTitle>
            <CardDescription className="text-xs">
              {flag.description || "No description"}
            </CardDescription>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ToggleSwitch enabled={flag.enabled} onToggle={onToggle} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {flag.enabled ? (
              <Badge className="anime-status-on border-0 text-[10px] font-bold uppercase tracking-widest">
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">
                Disabled
              </Badge>
            )}
            <span className="font-mono text-xs text-muted-foreground">
              {flag.rollout_percentage}% rollout
            </span>
            {flag.targeted_users.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {flag.targeted_users.length} targeted
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
