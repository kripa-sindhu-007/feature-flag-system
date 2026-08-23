"use client";

import Link from "next/link";
import {
  Flag,
  Percent,
  Users,
  Cpu,
  Radio,
  Boxes,
  History,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Compass,
} from "lucide-react";
import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { TourButton } from "@/components/explain/GuidedTour";
import { Button } from "@/components/ui/button";
import { GLOSSARY_BY_ID } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * The Learn index: the eight concepts in learning order, each as a card that
 * names the idea, gives its everyday analogy (pulled from the shared glossary so
 * it never drifts), and links to the live screen that demonstrates it. Learning
 * by reading *and* by doing, one click apart.
 */

type Chapter = {
  n: number;
  title: string;
  line: string;
  /** Glossary id for the analogy + definition link (optional). */
  termId?: string;
  icon: typeof Flag;
  /** Where to go see it live. */
  href: string;
  seeLabel: string;
};

const CHAPTERS: Chapter[] = [
  {
    n: 1,
    title: "What a feature flag is",
    line: "A switch for your app you can flip without shipping new code — turn a feature on for everyone, no one, or just some people.",
    icon: Flag,
    href: "/",
    seeLabel: "Flip one on the Overview",
  },
  {
    n: 2,
    title: "Percentage rollouts & determinism",
    line: "Turn a feature on for a fixed share of users. It isn't random per request: each user gets a stable dice roll, so the same person always lands the same side.",
    termId: "rollout",
    icon: Percent,
    href: "/demo",
    seeLabel: "Drag the rollout on the Demo",
  },
  {
    n: 3,
    title: "Targeting",
    line: "An always-on allow-list of specific users, checked before the percentage — so your beta testers or your own account see a feature immediately.",
    termId: "targeting",
    icon: Users,
    href: "/demo",
    seeLabel: "Check “Why ON/OFF?”",
  },
  {
    n: 4,
    title: "Local evaluation",
    line: "The SDK decides on the device with identical math and zero network calls — that's why it's instant and keeps working offline.",
    termId: "local-evaluation",
    icon: Cpu,
    href: "/demo",
    seeLabel: "Switch users on the Demo",
  },
  {
    n: 5,
    title: "Real-time updates (SSE)",
    line: "Changes are pushed to every client the instant they happen over a live stream — a radio you tune into, not a number you keep re-dialing.",
    termId: "sse",
    icon: Radio,
    href: "/cluster",
    seeLabel: "Watch the live feed",
  },
  {
    n: 6,
    title: "Many servers & convergence",
    line: "Flags run on three backends at once. Right after a change they can briefly differ, then all agree — that moment is convergence.",
    termId: "convergence",
    icon: Boxes,
    href: "/cluster",
    seeLabel: "See it converge",
  },
  {
    n: 7,
    title: "Versioning & safe edits",
    line: "Every change bumps a version and is recorded durably, so two people editing at once never silently clobber each other.",
    termId: "versioning",
    icon: History,
    href: "/flags",
    seeLabel: "Open a flag's history",
  },
  {
    n: 8,
    title: "Failure & recovery",
    line: "Lose the messenger or a server and writes still work — everyone holds last-known-good and quietly catches up when it returns.",
    termId: "reconcile",
    icon: ShieldCheck,
    href: "/resilience",
    seeLabel: "Watch it recover",
  },
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageIntro
        title="Learn feature flags by doing"
        subtitle="Eight short chapters, in order, from “what's a flag” to “how it survives a server going down.” Each one links to the live screen where you can watch it happen."
        actions={<TourButton />}
      />

      <GuideCallout>
        New here? Read these top to bottom — each concept builds on the last. Or
        jump straight to whatever you&apos;re curious about and follow the{" "}
        <span className="font-medium text-foreground">See it</span> link to the
        real thing.
      </GuideCallout>

      <ol className="space-y-3">
        {CHAPTERS.map((c) => (
          <ChapterCard key={c.n} chapter={c} />
        ))}
      </ol>

      {/* Where next */}
      <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Ready to experiment?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a flag with zero risk — nothing you do there is saved.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            nativeButton={false}
            render={<Link href="/glossary" />}
            variant="outline"
            size="sm"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Glossary
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/playground" />}
            size="sm"
          >
            <Compass className="h-3.5 w-3.5" />
            Open the Playground
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChapterCard({ chapter: c }: { chapter: Chapter }) {
  const entry = c.termId ? GLOSSARY_BY_ID[c.termId] : undefined;
  const Icon = c.icon;
  return (
    <li className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs font-semibold tabular-nums text-primary">
              {String(c.n).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {c.line}
          </p>

          {entry && (
            <p className="mt-2.5 flex gap-2 rounded-md border border-primary/20 border-l-2 border-l-primary bg-primary/[0.06] px-3 py-1.5 text-sm leading-relaxed text-foreground/90">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Like
              </span>
              <span>{entry.analogy}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Link
              href={c.href}
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
              )}
            >
              {c.seeLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {entry && (
              <Link
                href={`/glossary#${c.termId}`}
                className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
              >
                Definition
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
