"use client";

import { useState, useEffect, useCallback, ComponentType } from "react";
import { UserSwitcher } from "@/components/demo/UserSwitcher";
import { DarkModeFeature } from "@/components/demo/DarkModeFeature";
import { BetaDashboard } from "@/components/demo/BetaDashboard";
import { AiAssistant } from "@/components/demo/AiAssistant";
import { DynamicFlagCard } from "@/components/demo/DynamicFlagCard";
import { FeatureFlagClient } from "@/sdk/FeatureFlagClient";
import { FlagConfig } from "@/types/flag";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

const CUSTOM_FLAG_COMPONENTS: Record<
  string,
  ComponentType<{ isEnabled: boolean }>
> = {
  "dark-mode": DarkModeFeature,
  "beta-dashboard": BetaDashboard,
  "ai-assistant": AiAssistant,
};

export default function DemoPage() {
  // The client is external mutable state: we hold it in React state (not a ref)
  // so evaluating it during render is legitimate, and we re-render on every SDK
  // update by copying its flags into `allFlags`.
  const [client] = useState(
    () => new FeatureFlagClient({ baseUrl: API_URL, sdkKey: SDK_KEY })
  );
  const [currentUser, setCurrentUser] = useState("user-1");
  const [allFlags, setAllFlags] = useState<Map<string, FlagConfig>>(new Map());
  const [isReady, setIsReady] = useState(false);

  const syncFlags = useCallback(() => {
    setAllFlags(new Map(client.getAllFlags()));
  }, [client]);

  useEffect(() => {
    client
      .init()
      .then(() => {
        syncFlags();
        setIsReady(true);
      })
      .catch(() => setIsReady(true));

    const unsubscribe = client.onUpdate(syncFlags);

    return () => {
      unsubscribe();
      client.destroy();
    };
  }, [client, syncFlags]);

  // `allFlags` changes on every SDK update, so evaluating during render stays
  // in sync with the latest config.
  const isOn = (key: string) => client.isEnabled(key, currentUser);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Demo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The SDK evaluates flags <span className="text-foreground">locally</span> for
          the selected user. Switch users to see rollouts and targeting take
          effect — updates propagate live over SSE.
        </p>
      </div>

      <UserSwitcher currentUser={currentUser} onUserChange={setCurrentUser} />

      {!isReady ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <DarkModeFeature isEnabled={isOn("dark-mode")} />
          <BetaDashboard isEnabled={isOn("beta-dashboard")} />
          <AiAssistant isEnabled={isOn("ai-assistant")} />

          {Array.from(allFlags.entries()).map(([flagKey, flagConfig]) => {
            if (CUSTOM_FLAG_COMPONENTS[flagKey]) return null;
            return (
              <DynamicFlagCard
                key={flagKey}
                flagKey={flagKey}
                isEnabled={isOn(flagKey)}
                description={flagConfig.description}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
