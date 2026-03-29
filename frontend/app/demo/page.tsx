"use client";

import { useState, useEffect, useCallback, useRef, ComponentType } from "react";
import { motion } from "framer-motion";
import { Star, Sparkles } from "lucide-react";
import { UserSwitcher } from "@/components/demo/UserSwitcher";
import { DarkModeFeature } from "@/components/demo/DarkModeFeature";
import { BetaDashboard } from "@/components/demo/BetaDashboard";
import { AiAssistant } from "@/components/demo/AiAssistant";
import { DynamicFlagCard } from "@/components/demo/DynamicFlagCard";
import { FeatureFlagClient } from "@/sdk/FeatureFlagClient";
import { FlagConfig } from "@/types/flag";
import { pageTransition, defaultTransition, staggerContainer, staggerItem } from "@/components/motion/variants";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

// Custom components for specific flag keys
const CUSTOM_FLAG_COMPONENTS: Record<
  string,
  ComponentType<{ isEnabled: boolean }>
> = {
  "dark-mode": DarkModeFeature,
  "beta-dashboard": BetaDashboard,
  "ai-assistant": AiAssistant,
};

export default function DemoPage() {
  const [currentUser, setCurrentUser] = useState("user-1");
  const [allFlags, setAllFlags] = useState<Map<string, FlagConfig>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<FeatureFlagClient | null>(null);

  const syncFlags = useCallback((client: FeatureFlagClient) => {
    setAllFlags(new Map(client.getAllFlags()));
  }, []);

  useEffect(() => {
    const client = new FeatureFlagClient({
      baseUrl: API_URL,
      sdkKey: SDK_KEY,
    });
    clientRef.current = client;

    client
      .init()
      .then(() => {
        syncFlags(client);
        setIsReady(true);
      })
      .catch(() => {
        setIsReady(true);
      });

    const unsubscribe = client.onUpdate(() => {
      syncFlags(client);
    });

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, [syncFlags]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Connecting to feature flag service...
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-neon-cyan/20 bg-gradient-to-br from-neon-cyan/5 via-background to-primary/5 p-6">
        <div className="relative z-10">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-cyan/15">
              <Sparkles className="h-4 w-4 text-neon-cyan" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-neon-cyan/30 to-transparent" />
          </div>
          <h1 className="text-3xl font-bold uppercase tracking-wider">
            Demo <span className="text-neon-cyan">Application</span>
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            See how feature flags affect different users in real-time
          </p>
        </div>
        <Star className="absolute right-6 top-5 h-4 w-4 text-neon-cyan/20 anime-float" />
      </div>

      <UserSwitcher currentUser={currentUser} onUserChange={setCurrentUser} />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid gap-4 md:grid-cols-2"
      >
        {/* Default three cards - always rendered */}
        <motion.div variants={staggerItem}>
          <DarkModeFeature
            isEnabled={clientRef.current?.isEnabled("dark-mode", currentUser) ?? false}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <BetaDashboard
            isEnabled={clientRef.current?.isEnabled("beta-dashboard", currentUser) ?? false}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <AiAssistant
            isEnabled={clientRef.current?.isEnabled("ai-assistant", currentUser) ?? false}
          />
        </motion.div>

        {/* Dynamic flags that don't have custom components */}
        {Array.from(allFlags.entries()).map(([flagKey, flagConfig]) => {
          if (CUSTOM_FLAG_COMPONENTS[flagKey]) return null;
          const isEnabled =
            clientRef.current?.isEnabled(flagKey, currentUser) ?? false;
          return (
            <motion.div key={flagKey} variants={staggerItem}>
              <DynamicFlagCard
                flagKey={flagKey}
                isEnabled={isEnabled}
                description={flagConfig.description}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
