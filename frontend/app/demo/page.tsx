"use client";

import { useState, useEffect, useCallback, useMemo, ComponentType } from "react";
import { Plug, PlugZap, Loader2 } from "lucide-react";
import { useFlags } from "@/hooks/useFlags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserSwitcher } from "@/components/demo/UserSwitcher";
import { DarkModeFeature } from "@/components/demo/DarkModeFeature";
import { BetaDashboard } from "@/components/demo/BetaDashboard";
import { AiAssistant } from "@/components/demo/AiAssistant";
import { DynamicFlagCard } from "@/components/demo/DynamicFlagCard";
import {
  FeatureFlagClient,
  type ConnectionStatus,
} from "@/sdk/FeatureFlagClient";
import { FlagConfig } from "@/types/flag";
import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { Term } from "@/components/explain/Term";
import { RolloutVisualizer } from "@/components/explain/RolloutVisualizer";
import { WhyExplainer } from "@/components/explain/WhyExplainer";

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
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [clientVersion, setClientVersion] = useState(0);

  const syncFlags = useCallback(() => {
    setAllFlags(new Map(client.getAllFlags()));
    setClientVersion(client.getConfigVersion());
  }, [client]);

  useEffect(() => {
    const unStatus = client.onStatus(setStatus);
    const unUpdate = client.onUpdate(syncFlags);

    client
      .init()
      .then(() => {
        syncFlags();
        setIsReady(true);
      })
      .catch(() => setIsReady(true));

    return () => {
      unStatus();
      unUpdate();
      client.destroy();
    };
  }, [client, syncFlags]);

  // `allFlags` changes on every SDK update, so evaluating during render stays
  // in sync with the latest config.
  const isOn = (key: string) => client.isEnabled(key, currentUser);

  // The teaching section (visualizer + explainer) works on one flag at a time.
  // Default to the most illustrative real flag: a partial rollout if there is one.
  const flagList = useMemo(() => Array.from(allFlags.values()), [allFlags]);
  const defaultVizKey = useMemo(() => {
    const partial = flagList.find(
      (f) => f.enabled && f.rollout_percentage > 0 && f.rollout_percentage < 100
    );
    return (partial ?? flagList[0])?.key ?? "";
  }, [flagList]);
  const [pickedVizKey, setPickedVizKey] = useState<string | null>(null);
  const vizKey = pickedVizKey ?? defaultVizKey;
  const vizFlag = allFlags.get(vizKey);

  // Staleness (W1) + reconcile (W2): the server version polls live, so while the
  // stream is disconnected you can watch the SDK fall behind, then catch up.
  const { data } = useFlags();
  const serverVersion = data?.config_version ?? 0;
  const stale = isReady && client.isStale(serverVersion);
  const offline = status === "offline";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro
          title="See it decide, per user"
          subtitle={
            <>
              This is a real app using the SDK. It{" "}
              <Term name="local-evaluation">evaluates every flag locally</Term>{" "}
              for the selected user — switch users and watch the same flags land
              differently.
            </>
          }
          className="min-w-0"
        />
        {isReady && (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
              stale
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-success/30 bg-success/10 text-success"
            )}
            aria-live="polite"
            title="The SDK's local config version vs the server's latest"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                stale ? "bg-warning" : "bg-success"
              )}
            />
            <span className="font-medium">
              {stale ? "SDK behind" : "In sync"}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              client v{clientVersion} · server v{serverVersion}
            </span>
          </div>
        )}
      </div>

      <GuideCallout>
        Notice a user always gets the same answer — that&apos;s the{" "}
        <Term name="rollout">rollout</Term> being{" "}
        <Term name="determinism">deterministic</Term>, not random. Switch users
        below and watch the cards react — then scroll down to{" "}
        <em>see who a percentage includes</em> and check exactly why any user is
        on or off.
      </GuideCallout>

      {isReady && (
        <ReconnectPanel
          status={status}
          stale={stale}
          offline={offline}
          missed={Math.max(0, serverVersion - clientVersion)}
          onDisconnect={() => client.disconnect()}
          onReconnect={() => client.reconnect()}
        />
      )}

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

      {isReady && vizFlag && (
        <section className="space-y-4 border-t border-border pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <PageIntro
              title="Understand the rollout"
              subtitle={
                <>
                  A percentage isn&apos;t random — it maps to a fixed set of
                  users. Pick a flag, drag the percentage to see exactly who
                  flips, and check why any single user lands on or off.
                </>
              }
              className="min-w-0"
            />
            <div className="space-y-1.5">
              <Label htmlFor="viz-flag">Flag</Label>
              <Select
                value={vizKey}
                onValueChange={(val) => val && setPickedVizKey(val)}
              >
                <SelectTrigger id="viz-flag" className="w-52 font-mono">
                  <SelectValue placeholder="Select flag" />
                </SelectTrigger>
                <SelectContent>
                  {flagList.map((f) => (
                    <SelectItem key={f.key} value={f.key} className="font-mono">
                      {f.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <RolloutVisualizer flag={vizFlag} highlightUser={currentUser} />
            <WhyExplainer flag={vizFlag} initialUser={currentUser} />
          </div>
        </section>
      )}
    </div>
  );
}

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; dot: string; text: string }
> = {
  connecting: { label: "Connecting", dot: "bg-warning", text: "text-warning" },
  live: { label: "Live", dot: "bg-success", text: "text-success" },
  reconnecting: { label: "Reconnecting", dot: "bg-warning", text: "text-warning" },
  reconciling: { label: "Reconciling", dot: "bg-primary", text: "text-primary" },
  offline: { label: "Disconnected", dot: "bg-destructive", text: "text-destructive" },
};

function ReconnectPanel({
  status,
  stale,
  offline,
  missed,
  onDisconnect,
  onReconnect,
}: {
  status: ConnectionStatus;
  stale: boolean;
  offline: boolean;
  missed: number;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
            aria-live="polite"
          >
            {status === "reconciling" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            )}
            <span className={meta.text}>{meta.label}</span>
          </span>
          <p className="text-sm text-muted-foreground">
            {offline
              ? missed > 0
                ? `Stream closed — ${missed} update${missed > 1 ? "s" : ""} missed. Reconnect to reconcile.`
                : "Stream closed. Make changes in Flags, then reconnect."
              : stale
              ? "Behind — reconciling to the latest version…"
              : "Streaming live from the control plane."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            disabled={offline}
          >
            <Plug className="h-3.5 w-3.5" />
            Disconnect
          </Button>
          <Button size="sm" onClick={onReconnect} disabled={!offline}>
            <PlugZap className="h-3.5 w-3.5" />
            Reconnect
          </Button>
        </div>
      </div>
    </div>
  );
}
