"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Moon, Sun } from "lucide-react";
import { featureReveal, defaultTransition } from "@/components/motion/variants";

interface DarkModeFeatureProps {
  isEnabled: boolean;
}

export function DarkModeFeature({ isEnabled }: DarkModeFeatureProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isEnabled ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          Dark Mode
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
              className="rounded-md bg-gray-900 p-4 text-white"
            >
              <p className="text-sm font-medium">Dark mode is active</p>
              <p className="mt-1 text-xs text-gray-400">
                The UI is now displayed in dark theme for this user.
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
              className="rounded-md bg-gray-100 p-4"
            >
              <p className="text-sm font-medium text-gray-500">
                Dark mode is disabled
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Enable this flag to switch to dark theme.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
