# FlagPlane — Design System (MASTER)

> Source of truth for the UI revamp **and** every per-phase D5 slice. Read this before touching UI.
> Identity: **Linear Indigo** — near-black canvas, one indigo accent for *intent* (CTA / focus / active /
> selected), green & red reserved strictly for **live / down** status. Dark-first, light equally polished.
> Bar: Linear / Vercel / Stripe / Datadog. Derived via the `ui-ux-pro-max` skill (2026-08-18).
>
> Stack: Next.js 16 / React 19 · shadcn/ui · Tailwind CSS v4 · framer-motion · next-themes · lucide-react.

---

## 1. Principles

1. **Restraint over decoration.** Hairline borders, low radius, subtle elevation. No glassmorphism, no glow,
   no gradients-for-their-own-sake. Craft shows in spacing and typography, not effects.
2. **One accent, used sparingly.** Indigo means "act / focus / selected / primary". If everything is indigo,
   nothing is. Status (green/red/amber) is a *separate* language, never decorative.
3. **Data is the hero.** Dense, scannable, tabular. Numbers use mono + tabular figures so they never jitter
   as versions/latencies tick.
4. **Never color alone.** Every status = icon + color + text (WCAG `color-not-only`).
5. **Both themes are designed, not inferred.** Contrast verified independently in light and dark.
6. **Motion conveys meaning.** 150–300ms, ease-out in / faster out, `prefers-reduced-motion` honored. The one
   place motion earns real weight: version convergence/reconcile (W2).

---

## 2. Color tokens

Semantic names map to shadcn/ui CSS variables. Values are hex (convert to `oklch()` for Tailwind v4 `@theme`
if preferred — keep the semantic name stable either way). **Dark is primary.**

### Dark (primary)
| Token | Hex | Use |
|---|---|---|
| `--background` | `#0B0B10` | app canvas (near-black, cool; never pure #000) |
| `--surface` / `--card` | `#131318` | cards, sidebar, table surface |
| `--popover` / elevated | `#1B1B22` | menus, dialogs, drawers |
| `--muted` | `#1A1A21` | subtle fills, disabled bg |
| `--foreground` | `#EDEDF0` | primary text (not pure white — avoids glare) |
| `--muted-foreground` | `#9A9AA6` | secondary text, labels |
| `--border` | `#26262E` | hairline dividers/cards |
| `--border-strong` | `#33333D` | inputs, emphasized separation |
| `--primary` | `#6366F1` | CTA, active nav, selected, links |
| `--primary-hover` | `#7377F5` | primary hover |
| `--primary-foreground` | `#FFFFFF` | text on indigo |
| `--ring` | `#6366F1` | focus ring (2px, offset) |

### Light (equally polished)
| Token | Hex | Use |
|---|---|---|
| `--background` | `#FCFCFD` | app canvas (cool near-white) |
| `--surface` / `--card` | `#FFFFFF` | cards, surfaces |
| `--popover` | `#FFFFFF` | menus/dialogs (+ shadow) |
| `--muted` | `#F4F4F6` | subtle fills |
| `--foreground` | `#16161D` | primary text |
| `--muted-foreground` | `#6B6B76` | secondary text |
| `--border` | `#EAEAEF` | hairline |
| `--border-strong` | `#DCDCE3` | inputs |
| `--primary` | `#6366F1` | accent (same hue both themes) |
| `--primary-hover` | `#5457E5` | primary hover |
| `--primary-foreground` | `#FFFFFF` | text on indigo |
| `--ring` | `#6366F1` | focus ring |

### Status language (separate from the indigo accent — semantic only)
| State | Dark | Light | Meaning in this product |
|---|---|---|---|
| **Live / on / converged** | `#22C55E` | `#16A34A` | flag enabled, node reached latest version |
| **Down / conflict / off-error** | `#EF4444` | `#DC2626` | node down, version conflict (409), destructive |
| **Syncing / stale / behind** | `#F5A623` | `#D97706` | SDK/node behind latest, reconciling |
| **Neutral / off** | `--muted-foreground` | `--muted-foreground` | flag simply off, no alarm |

Rules: `color-accessible-pairs` (≥4.5:1 text, ≥3:1 UI glyphs) verified per theme; status always paired with a
lucide icon + label; charts use an indigo-anchored sequential scale, never red/green as the only encoder.

---

## 3. Typography

- **UI:** `Inter` (300–700). **Code/data:** `JetBrains Mono` (400–700), **tabular figures on**
  (`font-feature-settings: "tnum" 1`) for every version, id, count, latency, timestamp.
- Load via `next/font` (self-hosted, `display: swap`) — no external font CDN at runtime.

| Role | Font / weight / size / tracking | Notes |
|---|---|---|
| Display (rare) | Inter 600 · 30px · -0.02em | page hero only |
| H1 | Inter 600 · 24px · -0.01em | page title |
| H2 | Inter 600 · 18px | section |
| H3 | Inter 600 · 15px | card title |
| Body | Inter 400 · 14px · 1.5 | dashboard default |
| Body-sm | Inter 400 · 13px | secondary |
| Label / overline | Inter 500 · 12px · +0.04em · uppercase | muted-foreground |
| Data / mono | JetBrains Mono 500 · 13px · tabular | keys, `v128`, node ids, latencies |

> Density note: 14px base is the dev-dashboard norm (Linear/Vercel). **Inputs bump to 16px on touch/mobile**
> to avoid iOS auto-zoom (`readable-font-size`).

---

## 4. Spacing, radius, elevation, icons

- **Spacing (dense):** 4 · 8 · 12 · 16 · 24 · 32 · 48. Component gaps 8–12; section spacing 24–32.
- **Radius:** `--radius: 8px` cards · 6px inputs/buttons · pill (999px) for status + version badges.
- **Borders:** hairline `1px --border`. Elevation is mostly *border*, not shadow. Shadow only on floating
  layers (popover/dialog/drawer): dark = `0 8px 24px rgba(0,0,0,.5)`, light = `0 8px 24px rgba(16,16,29,.08)`.
- **Icons:** `lucide-react` only, 16px (inline) / 20px (nav), **1.5 stroke**, one family, aligned to text
  baseline. No emoji as icons ever.
- **Z-index scale:** 0 base · 10 sticky headers · 20 dropdowns · 40 drawer/dialog · 100 toast.

---

## 5. Layout & navigation (the app shell)

Persistent **left sidebar** + **top bar**; adaptive (sidebar collapses to icons <1024px, drawer <768px).

```
┌───────────┬──────────────────────────────────────────────────────────┐
│  FlagPlane│  [env: local ▾]        config_version ● v128   [◐ theme]  │  ← top bar
│           ├──────────────────────────────────────────────────────────┤
│ ▸ Flags   │                                                          │
│   Cluster │     main content (routed)                                │
│   Health  │                                                          │
│   Demo    │                                                          │
│           │                                                          │
│  ─────    │                                                          │
│   Docs    │                                                          │
└───────────┴──────────────────────────────────────────────────────────┘
```

- **Active nav** = indigo left-accent bar + subtle indigo tint + `aria-current="page"`.
- **`config_version` pill** in the top bar is live (`aria-live="polite"`) — the always-visible heartbeat of
  the whole system; every phase reads/writes it.
- Nav grows with phases (D5): **Flags + Demo** now (revamp); **Cluster** (W2), **Health** (W3), **Chaos**
  under Health or its own item (W4) appear as each lands — no dead/"coming soon" nav.

---

## 6. Component treatments

- **Button** — primary: indigo solid, `--primary-foreground`, 6px radius, h-9 (h-8 dense). Secondary: surface
  + `--border-strong`. Ghost: transparent, hover `--muted` (toolbar/icon actions). Loading = spinner +
  disabled (`loading-buttons`). One primary CTA per view.
- **Card** — `--card` bg, 1px `--border`, radius 8, no shadow. Section title (H3) + optional description.
- **Table / flag list** — sticky header, row min-h 44px, hover `--muted`, tabular numerals, sortable columns
  with `aria-sort`. Row = status dot+label · flag key (mono) · rollout% · `version` (mono pill) · targeting
  count · toggle.
- **Badge** — *version*: mono pill, `--muted` bg, `--foreground`. *Status*: dot (status hue) + text label.
- **Switch/Toggle** — indigo when on; optimistic UI, but reverts + toast on 409 version conflict (W1).
- **Form** — visible labels (never placeholder-only), helper text, inline validate on blur, error below field
  in destructive hue, focus first invalid on submit (`focus-management`).
- **Drawer** (flag history, W1) — right-side sheet, `--popover` + shadow, scrim 40–60% black, esc/click-out
  to close, focus-trapped.
- **Empty / loading / error** — skeleton shimmer >300ms; empty states give a one-line reason + next action;
  errors show cause + retry.
- **Toast** — `sonner`, top-right, auto-dismiss 3–5s, `aria-live="polite"`, never steals focus.

---

## 7. Motion

- Global tokens: enter 200ms ease-out, exit 140ms ease-in; hover/press 150ms. Press scale 0.98→1.0 on cards.
- Stagger list entrance 30–40ms/item, cap the effect. `prefers-reduced-motion` → cross-fade only, no move.
- **Signature moment (W2):** version convergence — nodes animating from divergent versions to a shared `vN`,
  and the reconnect→reconcile "catch-up" on `/demo`. This is the one place choreography is worth it; elsewhere
  motion stays invisible/functional.

---

## 8. Per-screen intent (hierarchical overrides live in `design-system/pages/`)

| Screen | Route | Revamp scope | Phase adds (D5) |
|---|---|---|---|
| App shell | (layout) | sidebar + top bar + live version pill + theme | Cluster/Health/Chaos nav as phases land |
| Flags list | `/flags` | dense sortable table, status language, quick toggle | version column + history entry point (W1) |
| Flag detail | `/flags/[id]` | overview + rollout + targeting, clean hierarchy | **history/events drawer** (W1) |
| New/Edit | `/flags/new` | form best-practices, inline validation | version-conflict (409) handling (W1) |
| Demo | `/demo` | per-user eval visualizer, honest "local eval" story | **staleness indicator** (W1); reconnect→reconcile view (W2) |
| Cluster | `/cluster` | — (new in W2) | 3-node propagation panel, "converged at vN" |
| Health | `/health` | — (new in W3) | per-node `/readyz`, SSE-count + p99 tiles, Grafana link |
| Chaos | `/health/chaos` | — (new in W4) | kill-node → watch versions reconcile live |

---

## 9. Explanation layer (teaching UX — added Wave 1, UX roadmap)

The dashboard doubles as a self-explaining teaching experience (see
[`docs/UX_ROADMAP.md`](../../docs/UX_ROADMAP.md)). These primitives are the
pervasive "the app explains itself" layer; reuse them, don't reinvent per page.

- **Explain toggle (global).** One switch in the top bar, persisted in
  localStorage (`flagplane-explain`), **default ON**. ON = teaching: guide
  callouts shown, `AdvancedDetails` collapsed. OFF = pro: callouts hidden,
  detail expanded. State lives in `ExplainProvider` / `useExplain`.
- **Guide voice = one visual layer.** The unnamed guide (charter in the roadmap)
  always renders as the **guide callout**: `Sparkles` icon + a 2px indigo
  **left accent** on `bg-primary/[0.06]` / `border-primary/20`. This indigo
  treatment is reserved for the guide layer + the "Like" analogy block, so
  "the app talking" reads as one thing, distinct from neutral tooltips (which
  stay `bg-foreground` on `text-background`).
- **Page pattern.** Every page opens with `PageIntro` — a plain-English H1
  title + one-line subtitle + optional one-line **status** (real data,
  `aria-live`) — then at most one `GuideCallout`, then the interactive content.
  Dense operator tiles/grids/numbers go inside `AdvancedDetails` (a labeled
  disclosure whose default open state = `!explain`).
- **Inline glossary.** `Term` = dotted-underline inline link (`decoration-dotted
  underline-offset-4`, hover → `decoration-primary`); hover/focus shows the short
  def (tooltip) and it links to `/glossary#id`. Terms always render (jargon help,
  not the guide layer). Single source of truth: `lib/glossary.ts`.
- **Color legend (always visible).** Sidebar footer, per the product code:
  **green = live** (on/healthy/caught-up), **red = down** (unreachable/conflict),
  **indigo = act** (you can act here). Reinforces "never color alone".
- **Teaching empty states.** An empty list explains the concept in one or two
  sentences + a clear CTA (not just "nothing here").

### Motion — the propagation hero
The Overview hero (`PropagationHero`) animates a real flag change traveling
admin → Postgres → Redis → backends → this browser. Tokens:
`@keyframes flagplane-flow` (an indigo pulse dot along a connector, 900ms
ease-in-out) and `flagplane-pop` (a node chip settling green as it reaches the
new version, 260ms). **All timings/node-lights are real** (measured client-side
via `/api/client/version` polls + the SSE stream); motion is pacing only.
`prefers-reduced-motion` (via `useReducedMotion`) drops the traveling pulse for a
clear stepped/static state — the story and the real ms number still read.

### Evaluation teaching (Wave 2)
Two signature components make deterministic rollout legible; both compute the
**real** SDK decision via `lib/evaluate.ts` (which reuses the SDK's own `fnv1a32`
and is pinned to `FeatureFlagClient.isEnabled` by a parity test — the UI never
invents its own math).

- **`RolloutVisualizer`.** A 10×10 grid of 100 sample users (`user-1…user-100`),
  each placed by its **real** fixed hash bucket for the flag, **sorted ascending**
  so raising the % fills the grid like a meter. Cells: indigo = on (in rollout),
  indigo + `ring-warning` = on (targeted, overrides %), `bg-muted` = off; the
  current user gets a `ring-foreground` outline. The % slider is a **what-if
  explorer** — starts at the flag's real value, never writes (the real editor is
  the flag form), always labels "Exploring hypothetically… Actual rollout: N%"
  with a *Reset to actual*. Determinism reads because cells flip **in place**;
  clicking one reveals `fnv1a32("key:user") % 100 = N → N < pct?`. Keyboard:
  roving-tabindex grid (arrows/Home/End), `prefers-reduced-motion` drops the
  color transition.
- **`WhyExplainer`.** A user id → a 3-step verdict card mirroring the SDK's order:
  enabled? → targeted? → in rollout (`bucket < pct`)? Short-circuits render
  honestly as "not reached" (disabled kill-switch, or targeting already decided).
  Verdict badge is icon + text (never color alone); `aria-live` on the verdict.

Both live on **`/demo`** (with a flag picker + the current demo user) and
**`/flags/[id]`** (bound to that flag's real config). New glossary terms:
`determinism`, `hash-bucket`.

### Distributed-magic components (Wave 3)
Making the multi-node system visible; all three read **real** sources (no mocks).

- **`ClusterHero`** (`components/cluster/`). The Overview hero, retuned for
  `/cluster`: the 3 backends are the star. Flip `hero-demo` → each node card shows
  its real `vOld → vNew?` transition (amber, `line-through` old + `ArrowRight` to
  `v{target}?`) while behind, then flips green with its real arrival ms; an
  explicit **Diverged (N/3) → Converged at vN** badge. Same real-timing method as
  `PropagationHero` (t0 = send, poll each `/api/client/version` until it reaches
  target). `prefers-reduced-motion` drops the `flagplane-pop`.
- **`SseConsole`** (`components/explain/`). A human-readable window on the **real**
  SSE stream: a plain `EventSource` to the LB renders each `flag_updated` /
  `flag_deleted` frame as one line — `v2254 · checkout · ON · 50%` — newest-first,
  `role="log"` + `aria-live="polite"`, connection pill (live/connecting/down),
  pause + clear. Timestamps are client-observed arrival (honest label, not the
  event's own time). `compact` prop = short chrome-light variant for the Overview.
- **`VersionTimeline`** (`components/explain/` + `hooks/useEvents.ts`). The durable
  **event log** drawn as a horizontal timeline (oldest→newest, auto-scrolls to the
  newest). `useEvents(latest, window)` fetches `/api/client/events?since=latest−window`
  (reconcile endpoint returns events *after* since, ascending, cap 1000). Ticks
  are buttons (created=indigo / updated=neutral / deleted=muted); click → a detail
  line (enabled, rollout, targeting count, timestamp). New glossary term:
  `event-log`.

### Slider accessibility note
`components/ui/slider.tsx` (base-ui) renders the `role=slider` `<input type=range>`
**inside the Thumb**, so an `aria-label`/`aria-labelledby` on the component is
forwarded to the Thumb (not just Root) — otherwise the slider has no accessible
name. Always pass one.

## 10. Pre-ship checklist (every UI change)

- [ ] Screenshot-verified in a real browser (Playwright), **light + dark**, via the `frontend-ui` skill.
- [ ] Contrast ≥4.5:1 text / ≥3:1 glyphs, verified per theme.
- [ ] Status conveyed by icon + text, not color alone.
- [ ] Keyboard: visible focus rings, tab order matches visual order, drawers/dialogs focus-trapped + esc.
- [ ] `prefers-reduced-motion` respected.
- [ ] Numbers use mono + tabular figures.
- [ ] Responsive at 375 / 768 / 1024 / 1440; no horizontal scroll.
- [ ] `aria-live` on live-updating regions (version pill, propagation, staleness).
