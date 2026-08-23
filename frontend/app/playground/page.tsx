"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Blocks,
  ShieldOff,
  Plug,
  PlugZap,
  Loader2,
  X,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { Term } from "@/components/explain/Term";
import { RolloutVisualizer } from "@/components/explain/RolloutVisualizer";
import { WhyExplainer } from "@/components/explain/WhyExplainer";
import {
  FeatureFlagClient,
  type ConnectionStatus,
} from "@/sdk/FeatureFlagClient";
import { useFlags } from "@/hooks/useFlags";
import type { EvaluableFlag } from "@/lib/evaluate";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

/** The sandbox flag key — real hashing, but the flag lives only in this page. */
const SANDBOX_KEY = "playground";

export default function PlaygroundPage() {
  const [enabled, setEnabled] = useState(true);
  const [rollout, setRollout] = useState(30);
  const [targeted, setTargeted] = useState<string[]>(["alice"]);
  const [userInput, setUserInput] = useState("");
  const [evalUser, setEvalUser] = useState("user-1");

  const flag: EvaluableFlag = {
    key: SANDBOX_KEY,
    enabled,
    rollout_percentage: rollout,
    targeted_users: targeted,
  };

  const addTargeted = () => {
    const u = userInput.trim();
    if (u && !targeted.includes(u)) setTargeted((prev) => [...prev, u]);
    setUserInput("");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        title="Playground"
        subtitle="Build a flag and watch every concept react — the rollout, who's in, and exactly why. It's a real evaluator on a make-believe flag, so you can't break anything."
      />

      {/* Safety banner */}
      <div
        className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.05] px-4 py-2.5 text-sm text-foreground/90"
        role="note"
      >
        <Blocks className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="font-medium">Sandbox — nothing here is saved.</span>{" "}
          This flag never touches the server. To create a real one, head to{" "}
          <Link
            href="/flags"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Flags
          </Link>
          .
        </span>
      </div>

      {/* Builder */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Build your flag</h3>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {/* Enabled */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="pg-enabled" className="text-sm">
                Enabled
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Off = a kill switch: off for everyone, targeting included.
              </p>
            </div>
            <Switch id="pg-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Rollout */}
          <div className="rounded-md border border-border bg-background/40 px-4 py-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                <Term name="rollout">Rollout</Term> percentage
              </Label>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                {rollout}%
              </span>
            </div>
            <Slider
              value={[rollout]}
              onValueChange={(v) => setRollout(Array.isArray(v) ? v[0] : (v as number))}
              min={0}
              max={100}
              step={1}
              className="mt-3"
              aria-label="Rollout percentage"
              disabled={!enabled}
            />
          </div>

          {/* Targeting */}
          <div className="rounded-md border border-border bg-background/40 px-4 py-3 md:col-span-2">
            <Label htmlFor="pg-target" className="text-sm">
              <Term name="targeting">Targeted</Term> users
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Always on for these users, regardless of the percentage.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {targeted.map((u) => (
                <span
                  key={u}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground"
                >
                  {u}
                  <button
                    type="button"
                    onClick={() => setTargeted((prev) => prev.filter((x) => x !== u))}
                    aria-label={`Remove ${u}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <Input
                  id="pg-target"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTargeted();
                    }
                  }}
                  placeholder="add a user id…"
                  className="h-8 w-40 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="button" size="sm" variant="outline" onClick={addTargeted}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </span>
            </div>
          </div>
        </div>
      </section>

      <GuideCallout>
        Everything below updates the instant you change the flag above — same math
        the real SDK ships. Try dragging the rollout to 0% (a kill by percentage),
        then add a user to targeting and watch them stay on anyway.
      </GuideCallout>

      {/* Live reaction — reuses the Wave-2 teaching components */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <RolloutVisualizer flag={flag} highlightUser={evalUser} />
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <Label htmlFor="pg-eval" className="text-sm">
              Spotlight a user
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Highlights them in the grid and pre-fills the explainer below.
            </p>
            <Input
              id="pg-eval"
              value={evalUser}
              onChange={(e) => setEvalUser(e.target.value)}
              placeholder="user-1"
              className="mt-2 w-48 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <WhyExplainer flag={flag} key={evalUser} initialUser={evalUser} />
        </div>
      </div>

      {/* Failure & recovery — real, safe, browser-triggerable */}
      <FailureLab />
    </div>
  );
}

/**
 * A real, safe failure demo: it connects to the actual SSE stream, then lets you
 * cut and restore *your own* connection. Disconnect and the client falls behind;
 * reconnect and it reconciles the gap from the durable log — the same recovery
 * the SDK does in production. For server/cache chaos, the Resilience page watches
 * the real thing (driven out-of-band by the chaos scripts).
 */
function FailureLab() {
  const [client] = useState(
    () => new FeatureFlagClient({ baseUrl: API_URL, sdkKey: SDK_KEY })
  );
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [clientVersion, setClientVersion] = useState(0);
  const { data } = useFlags();
  const serverVersion = data?.config_version ?? 0;

  useEffect(() => {
    const unStatus = client.onStatus(setStatus);
    const unUpdate = client.onUpdate(() => setClientVersion(client.getConfigVersion()));
    client
      .init()
      .then(() => setClientVersion(client.getConfigVersion()))
      .catch(() => {});
    return () => {
      unStatus();
      unUpdate();
      client.destroy();
    };
  }, [client]);

  const offline = status === "offline";
  const missed = Math.max(0, serverVersion - clientVersion);
  const meta = STATUS_META[status];

  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-label="Failure and recovery">
      <div className="flex items-center gap-2">
        <ShieldOff className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          What happens when it breaks?
        </h3>
      </div>
      <GuideCallout className="mt-3">
        Cut your own connection below. The client keeps its last-known-good config
        (never wrong, just frozen); when you reconnect it{" "}
        <Term name="reconcile">reconciles</Term> the gap from the durable{" "}
        <Term name="event-log">log</Term>. For a server or cache going down, the{" "}
        <Link href="/resilience" className="font-medium text-primary underline-offset-2 hover:underline">
          Resilience
        </Link>{" "}
        page watches the real cluster recover.
      </GuideCallout>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium" aria-live="polite">
            {status === "reconciling" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            )}
            <span className={meta.text}>{meta.label}</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            client v{clientVersion} · server v{serverVersion}
            {offline && missed > 0 && (
              <span className="ml-2 text-warning">{missed} behind</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => client.disconnect()} disabled={offline}>
            <Plug className="h-3.5 w-3.5" />
            Disconnect
          </Button>
          <Button size="sm" onClick={() => client.reconnect()} disabled={!offline}>
            <PlugZap className="h-3.5 w-3.5" />
            Reconnect
          </Button>
        </div>
      </div>

      <Link
        href="/resilience"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        Watch real server &amp; cache failures on Resilience
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
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
