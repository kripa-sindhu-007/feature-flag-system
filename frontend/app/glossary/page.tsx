"use client";

import { PageIntro } from "@/components/explain/PageIntro";
import { GuideCallout } from "@/components/explain/GuideCallout";
import { GLOSSARY } from "@/lib/glossary";

export default function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageIntro
        title="Glossary"
        subtitle="Every concept this system teaches, in plain English — with the everyday analogy that makes it stick."
      />

      <GuideCallout>
        These are the words the rest of the app links to. Wherever you see a{" "}
        <span className="underline decoration-dotted underline-offset-4">
          dotted underline
        </span>
        , it points back here — so you never have to already know the jargon.
      </GuideCallout>

      <dl className="space-y-3">
        {GLOSSARY.map((entry) => (
          <div
            key={entry.id}
            id={entry.id}
            className="scroll-mt-20 rounded-lg border border-border bg-card p-5"
          >
            <dt className="font-mono text-[15px] font-semibold text-foreground">
              {entry.term}
            </dt>
            <dd className="mt-2 space-y-3 text-sm">
              <p className="leading-relaxed text-muted-foreground">
                {entry.definition}
              </p>
              <p className="flex gap-2 rounded-md border border-primary/20 border-l-2 border-l-primary bg-primary/[0.06] px-3 py-2 leading-relaxed text-foreground/90">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-primary">
                  Like
                </span>
                <span>{entry.analogy}</span>
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
