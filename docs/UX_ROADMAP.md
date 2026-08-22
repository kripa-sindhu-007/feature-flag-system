# UX Roadmap — the self-explaining feature-flag system

A plan to rework the dashboard from a dense *operator* tool into a **guided,
self-explaining experience** where someone just starting CS can understand what a
distributed feature-flag system does — by *using* it, not by reading a manual.

This is the UX companion to [`docs/ENGINEERING_ROADMAP.md`](./ENGINEERING_ROADMAP.md)
(the 4-week backend build, now complete). The engineering exists and works; this
roadmap makes it *legible*.

---

## Goal & audience

**Learning is the product.** The primary audience is a CS newcomer (and the
recruiter/reviewer watching them use it). Optimize for "aha" — visualizations,
narration, and a polished guided flow — over raw operator density. The real
capabilities stay real; we make them *visible and explained*, never faked.

## Guiding principles

1. **Show, then explain.** Let the user touch something and see it react *before*
   any paragraph. Explanation is the second beat, never the first.
2. **Accuracy over cuteness.** Every analogy must stay technically true; a wrong
   simplification is worse than none. Every number/animation reflects the real
   running system — no mocked data, ever.
3. **Explanation-first, not dumbed-down.** Pages lead with plain English; the
   dense truth is always one click away (see the Explain toggle).
4. **Don't patronize.** Opt-out explanations, respectful tone, real depth beneath.
5. **Accessible by construction.** Full keyboard nav; honor `prefers-reduced-motion`
   (animations degrade to clear static states); WCAG-AA contrast in light + dark.

## Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| UD1 | **Teaching showcase** is the goal (learning is the product) | Portfolio + newcomer comprehension, not just operator ergonomics. |
| UD2 | **Rework the existing pages** into one explanation-first experience | One unified UI, not a bolted-on separate "learn" area. |
| UD3 | **Explanation-first + a lightweight "Explain" toggle** | Teaching is the default; the toggle collapses callouts and reveals dense "Advanced details" for pros. No dual design to maintain. |
| UD4 | **"Life of a flag change" narrative is the core spine** | A single recurring story makes the whole app cohere instead of a pile of widgets. |
| UD5 | **Hero moment = flip → live propagation across the cluster** | The screen-recordable anchor; shows the distributed system's soul with real timings. |
| UD6 | **Unnamed, consistent guide voice** (subtle indigo callout, no mascot) | Warmth via voice, not a character; keeps the pro Linear-Indigo aesthetic. |

## Design language

Keep the **Linear Indigo** identity ([`frontend/design-system/MASTER.md`](../frontend/design-system/MASTER.md)),
softened for learners: more breathing room, an always-visible color legend
(green = live, red = down, indigo = you-can-act), purposeful motion that leads the
eye along the journey, and a distinct visual treatment for **guide callouts** so
"the app explaining itself" reads as one consistent layer. MASTER.md is the source
of truth and gets extended (guide-callout tokens, motion tokens, legend) as we go.

---

## The narrative spine — "the life of a flag change"

Every hard concept is a chapter of one journey:

> You flip a flag → it becomes **v43** (versioning) → it's written to the database
> *first* (durability) → Redis announces it to all 3 servers (propagation) → your
> browser is *pushed* the change (SSE) → your device decides per-user with identical
> math (evaluation) → a server that was asleep quietly catches up (resilience).

### The guide voice (charter)

- **Persona:** a calm, sharp senior engineer walking a junior through the system —
  "here's what just happened, and why it's clever." Confident, curious, lightly
  witty; never a cartoon, never condescending.
- **Rules:** present tense · second person ("you just…") · one idea per sentence ·
  name the concept *and* its everyday analogy together · always answer "why it
  matters," not only "what it is."
- **Rendering:** a consistent indigo "guide" callout (icon + subtle left accent),
  visually distinct from neutral tooltips; collapsible via the Explain toggle.
- **Sample lines:**
  - *"Nice — you just flipped `checkout`. It's now version 43. Watch it travel to all three servers."*
  - *"25%? That's not random. Each user gets a fixed dice roll, so the same person always lands the same side — no flicker between page loads."*
  - *"Redis just went down. Notice writes still work — Redis is the messenger, the database is the memory. When it's back, everyone catches up."*

### Analogy bank (reuse everywhere so they stick)

| Concept | Analogy |
|---------|---------|
| Percentage rollout | A bouncer with a permanent guest list **and** a dice that always rolls the same number for you. |
| SSE / real-time | A live radio, not you phoning the server every few seconds. |
| Versioning | Save points. |
| Reconcile after a gap | You dozed off in the meeting, then quietly read the notes to catch up. |
| Redis vs Postgres | The messenger vs. the memory (lose the messenger, the memory's intact). |

---

## The hero — flip → propagation (design first, reuse everywhere)

- **Where:** centerpiece of the Overview (above the fold); reused on the Cluster page.
- **The beat:** press **Flip it** → an indigo pulse travels admin → Postgres
  (*"saved first — the source of truth"*) → Redis (*"announced"*) → backend1/2/3
  (each lights green as it applies) → your browser (*"pushed here live"*) → settles
  on **"converged at v43 · 14 ms."**
- **Real, not faked:** timings from actual round-trip/metrics; node lights from real
  `/api/client/version`; a down node visibly lags then catches up. A **Replay**
  button re-runs the last real change for demos.
- **Both states, honestly:** the happy path (all converge fast) **and** the
  diverging → reconverging path (a node was behind) — the second is the whole point.

---

## Learning path & chapter map

Concepts ordered by difficulty; each maps to a page + a Learn card + a "Next →":

1. What a flag is → 2. Percentage rollouts & **determinism** → 3. Targeting →
4. Local evaluation → 5. Real-time updates (**SSE**) → 6. Many servers &
**convergence** → 7. Versioning & safe concurrent edits → 8. Failure & recovery.

| Page | Chapter | Signature element |
|------|---------|-------------------|
| Overview `/` | "Flip one & watch it travel" | **The hero** (versioning → durability → propagation → push) |
| Demo `/demo` | Evaluation | Rollout visualizer + "Why ON/OFF?" explainer |
| Cluster `/cluster` | Convergence | Hero reused across 3 nodes + plain-English convergence narration |
| Health `/health` | Is the fleet healthy? | Plain-English headline, dense tiles under "Advanced" |
| Resilience `/resilience` | Failure & recovery | Narrated observe-only chaos |
| Flags `/flags`, `/flags/[id]` | The real operator surface, narrated | Version timeline; inline explainers |
| Learn `/learn` *(new)* | Index of all chapters | Illustrated concept cards + glossary |
| Playground `/playground` *(new)* | Try everything | Guided sandbox: build a flag, watch every concept react |

---

## Signature interactive components

- **Rollout visualizer** — a 10×10 grid of users; drag the % and watch exact cells
  flip **in place** (never reshuffle — that's the determinism "aha"); click a user
  to reveal `hash("checkout:user-42") → 27 < 50 → ON`; add to targeting to see the
  override.
- **"Why ON/OFF?" explainer** — enter a user, get a 3-step verdict card:
  *Enabled? ✓ → Targeted? ✗ → In rollout (27<50)? ✓ → **ON***.
- **Propagation animation** — the hero (above).
- **Human-readable SSE console** — a live feed of real events in plain words
  ("v42: 'checkout' toggled ON").
- **Version timeline** — a horizontal history of `config_version` events.
- **Guide callout + Explain toggle + Glossary** — the pervasive explanation layer.

---

## Phased delivery (one branch + ★ ship per wave, per D7)

**Wave 1 — Explanation layer + the hero (foundation).**
The pervasive teaching layer everything builds on, plus the anchor moment so the
very first ship is impressive. Explanation-first page pattern (plain-English header
+ one big status; dense tiles → "Advanced details" disclosure), the guide-callout
primitive + Explain toggle, plain-English subtitles on every page, a Glossary page
with inline term links, teaching empty states, and the **flip → propagation hero**
(happy-path, real data) on Overview.

**Wave 2 — Evaluation, made interactive.**
Rollout visualizer + "Why ON/OFF?" explainer on Demo and flag detail — the two
concepts newcomers struggle with most.

**Wave 3 — The distributed magic, visible.**
Deepen the hero on Cluster (multi-node, the diverging → reconverging state), the
human-readable SSE console, and the version timeline.

**Wave 4 — Guided experience & sandbox.**
First-run guided tour, the `/learn` concept-card index, and the `/playground`
sandbox (incl. observe-only "simulate a failure" narrated via the resilience work).

Each wave: designed with the `frontend-ui` + `ui-ux-pro-max` + `frontend-design`
skills, screenshot-verified light + dark × desktop + mobile, zero console errors,
real data only.

## Definition of done (initiative)

- A newcomer can land, flip a flag, and understand what happened within a minute —
  without prior knowledge.
- Every page answers "what is this / what's happening now / why" in plain English,
  with the dense operator view one click away.
- All eight concepts are teachable in-app via real, interactive elements.
- The guide voice is consistent across every page; the Explain toggle cleanly
  switches teaching ↔ dense.
- Nothing is faked; accessibility (keyboard, reduced-motion, contrast) holds.

## What NOT to do

- No mocked/faked data to make a demo look good — every element reflects reality.
- No parallel Beginner/Pro designs to maintain — one UI, progressive disclosure.
- No condescension; no cartoon mascot.
- No scope creep into A/B testing, auth, webhooks (tracked separately as
  post-engineering-roadmap backlog).
- Don't rewrite the FNV-1a hashing, the SDKs' protocol, or the backend contracts —
  this is a presentation-layer initiative.
