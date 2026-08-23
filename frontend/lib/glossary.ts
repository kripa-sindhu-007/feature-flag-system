/**
 * The shared glossary — the single source of truth for inline <Term> tooltips
 * and the /glossary page. Definitions are plain-English; each carries an analogy
 * from the UX roadmap analogy bank so the mental model sticks. Keep the guide
 * voice: concept + analogy + why it matters.
 */
export type GlossaryEntry = {
  /** URL-safe anchor id, also the key passed to <Term name="…">. */
  id: string;
  /** Display term. */
  term: string;
  /** One line for the tooltip. */
  short: string;
  /** A short plain-English paragraph for the glossary page. */
  definition: string;
  /** The everyday analogy. */
  analogy: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "rollout",
    term: "Percentage rollout",
    short:
      "Turn a feature on for a fixed share of users — the same people each time, no flicker.",
    definition:
      "A flag can be on for only a slice of users — say 25%. It isn't random per request: each user gets a fixed dice roll from a hash of their id, so the same person always lands on the same side. You can dial the percentage up as you gain confidence.",
    analogy:
      "A bouncer with a permanent guest list and a dice that always rolls the same number for you.",
  },
  {
    id: "targeting",
    term: "Targeting",
    short: "An always-on allow-list of specific users, regardless of the rollout %.",
    definition:
      "Named users who always get the feature, no matter the rollout percentage. Targeting is checked before the percentage, so your beta testers or your own account see the change immediately while everyone else waits for the rollout.",
    analogy: "The VIP list at the door — you're in, no dice roll needed.",
  },
  {
    id: "local-evaluation",
    term: "Local evaluation",
    short: "The SDK decides on/off on the device — no network call per check.",
    definition:
      "The SDK holds the full flag config and computes on/off right on the device using the same math everywhere. Checking a flag is a local function call, not a request to the server, so it's instant and keeps working even if the network blips.",
    analogy:
      "Everyone carries the same rulebook, so nobody has to phone head office to make a call.",
  },
  {
    id: "sse",
    term: "SSE (real-time updates)",
    short: "The server pushes changes to the browser over a live stream.",
    definition:
      "Server-Sent Events keep a one-way stream open from the server to the client. When a flag changes, the server pushes it down the stream immediately — the client doesn't poll on a timer. That's how a flip reaches every open page in milliseconds.",
    analogy: "A live radio you leave on, not you dialing the station every few seconds.",
  },
  {
    id: "propagation",
    term: "Propagation",
    short: "A change traveling from the database out to every server and client.",
    definition:
      "The journey a flag change takes after you save it: written to Postgres, announced over Redis, applied by every backend, then pushed to connected clients. Propagation latency is how long that whole trip takes, measured end to end.",
    analogy: "A memo leaving the head office and reaching every desk in the building.",
  },
  {
    id: "convergence",
    term: "Convergence",
    short: "Every node agreeing on the same latest version.",
    definition:
      "The cluster has converged when every reachable node reports the same config version. Right after a change they may briefly differ; convergence is the moment they all catch up and agree again.",
    analogy: "Everyone in the meeting finally on the same page number.",
  },
  {
    id: "config-version",
    term: "config_version",
    short: "A global counter that bumps by one on every committed change.",
    definition:
      "One monotonically increasing number for the whole system, incremented on each committed change. It's the heartbeat you see in the top bar. Comparing versions tells you instantly whether a node or client is up to date or behind.",
    analogy: "A save-point counter — every save gets the next number.",
  },
  {
    id: "versioning",
    term: "Versioning",
    short: "Numbering every change so anyone can tell what they've applied.",
    definition:
      "Every change is stamped with a version number. Clients apply versions in order and never go backwards, so it's always clear which state each client is on and whether it has missed anything.",
    analogy: "Save points in a game — each has a number, and you load them in order.",
  },
  {
    id: "reconcile",
    term: "Reconcile",
    short: "A client that fell behind replays the missed changes in order to catch up.",
    definition:
      "If a client's stream drops and it misses events, on reconnect it asks the server for everything after its last version and replays those changes in order. It ends up at the exact latest state — no full reload, no guessing.",
    analogy: "You dozed off in the meeting, then quietly read the notes to catch up.",
  },
  {
    id: "optimistic-concurrency",
    term: "Optimistic concurrency",
    short: "Edits carry the version you saw; a stale edit is rejected with a 409.",
    definition:
      "When you save an edit, the client sends the version it loaded (an If-Match check). If someone changed the flag in the meantime, the server rejects your write with a 409 conflict instead of silently overwriting their change. You re-load and retry on the fresh version.",
    analogy:
      "Editing a shared doc: if it changed under you, it warns you before you clobber someone's work.",
  },
  {
    id: "p99",
    term: "p99",
    short: "The value 99% of measurements come in under — a tail-latency check.",
    definition:
      "A percentile. p99 propagation latency means 99% of changes propagated faster than this number; only the slowest 1% took longer. Watching the tail (p99), not just the average, is how you catch the bad-case experience.",
    analogy: "Not the typical commute — the near-worst day you should still plan around.",
  },
  {
    id: "readyz",
    term: "/readyz",
    short: "A per-node health check: is this server ready to serve correct data?",
    definition:
      "Each backend exposes /readyz. It returns ready only when the node can reach its dependencies (Postgres, Redis) and holds current config. A load balancer uses it to route traffic only to nodes that can actually serve correct answers.",
    analogy: "A shop's 'Open' sign — it only flips on when the tills and lights actually work.",
  },
  {
    id: "event-log",
    term: "Event log",
    short: "The durable, ordered record of every flag change — the real history.",
    definition:
      "Every change is appended to a durable log in the database, each with a monotonically increasing version. Unlike the live stream (which is ephemeral and can be missed), the log is the source of truth: a client that fell behind replays from it to catch up, and the version timeline is just this log, drawn.",
    analogy: "A ship's logbook — the messenger may not always reach you, but the log is always there to read back.",
  },
  {
    id: "determinism",
    term: "Determinism",
    short: "Same input, same answer, every time — no randomness, no flicker.",
    definition:
      "A rollout is deterministic: a given user always gets the same verdict for a flag, on every page load and on every server. It isn't a fresh coin flip each request — it's a fixed roll derived from the user's id. That's why 25% means the same 25% of people, not a different quarter each time.",
    analogy: "A dice that always rolls the same number for you — your seat is fixed.",
  },
  {
    id: "hash-bucket",
    term: "Hash bucket",
    short: "A user's fixed 0–99 slot for a flag, from a hash of their id.",
    definition:
      "To decide a percentage rollout without storing per-user state, the flag key and user id are hashed (FNV-1a) into a number 0–99 — the user's bucket. If the bucket is below the rollout percentage, they're in. Because the hash is fixed, so is the bucket, so the answer is stable and every server computes it identically.",
    analogy: "A permanent locker number — everyone can look it up and get the same one.",
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((e) => [e.id, e])
);
