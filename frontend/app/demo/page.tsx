"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { UserSwitcher } from "@/components/demo/UserSwitcher";
import { DarkModeFeature } from "@/components/demo/DarkModeFeature";
import { BetaDashboard } from "@/components/demo/BetaDashboard";
import { AiAssistant } from "@/components/demo/AiAssistant";
import { FeatureFlagClient } from "@/sdk/FeatureFlagClient";
import { pageTransition, defaultTransition } from "@/components/motion/variants";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

export default function DemoPage() {
  const [currentUser, setCurrentUser] = useState("user-1");
  const [flagVersion, setFlagVersion] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [betaDash, setBetaDash] = useState(false);
  const [aiAssist, setAiAssist] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<FeatureFlagClient | null>(null);

  useEffect(() => {
    const client = new FeatureFlagClient({
      baseUrl: API_URL,
      sdkKey: SDK_KEY,
    });
    clientRef.current = client;

    client.init().then(() => {
      setIsReady(true);
    }).catch(() => {
      // Backend may not be running yet
      setIsReady(true);
    });

    const unsubscribe = client.onUpdate(() => {
      setFlagVersion((v) => v + 1);
    });

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, []);

  const evaluateFlags = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    setDarkMode(client.isEnabled("dark-mode", currentUser));
    setBetaDash(client.isEnabled("beta-dashboard", currentUser));
    setAiAssist(client.isEnabled("ai-assistant", currentUser));
  }, [currentUser]);

  useEffect(() => {
    evaluateFlags();
  }, [currentUser, flagVersion, evaluateFlags]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Connecting to feature flag service...</p>
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
      <div>
        <h1 className="text-2xl font-bold">Demo Application</h1>
        <p className="mt-1 text-muted-foreground">
          See how feature flags affect different users in real-time.
        </p>
      </div>

      <UserSwitcher currentUser={currentUser} onUserChange={setCurrentUser} />

      <div className="grid gap-4 md:grid-cols-2">
        <DarkModeFeature isEnabled={darkMode} />
        <BetaDashboard isEnabled={betaDash} />
      </div>

      <AiAssistant isEnabled={aiAssist} />
    </motion.div>
  );
}
