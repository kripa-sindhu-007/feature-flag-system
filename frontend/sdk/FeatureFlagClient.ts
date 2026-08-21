import { FlagConfig, FlagEvent } from "@/types/flag";

interface SDKConfig {
  baseUrl: string;
  sdkKey: string;
  refreshInterval?: number;
}

/** Live connection state, surfaced via onStatus for the reconnect/reconcile UI. */
export type ConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "reconciling"
  | "offline";

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash = hash >>> 0;
  }
  return hash;
}

export class FeatureFlagClient {
  private config: SDKConfig;
  private flags: Map<string, FlagConfig>;
  private eventSource: EventSource | null = null;
  private listeners: Set<(flags: Map<string, FlagConfig>) => void>;
  private statusListeners: Set<(status: ConnectionStatus) => void>;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  // Highest global config version this client has applied. Lets it detect that
  // it is behind the server (staleness), ignore stale/duplicate events, and
  // spot gaps (a missed event) so it can reconcile.
  private configVersion = 0;
  private status: ConnectionStatus = "offline";
  private reconciling = false;
  // Set while the caller has explicitly disconnected, so the browser's built-in
  // EventSource auto-reconnect doesn't fight a simulated outage.
  private manuallyClosed = false;

  constructor(config: SDKConfig) {
    this.config = config;
    this.flags = new Map();
    this.listeners = new Set();
    this.statusListeners = new Set();
  }

  async init(): Promise<void> {
    this.setStatus("connecting");
    await this.bootstrap();
    this.connectSSE();

    if (this.config.refreshInterval) {
      // Poll-reconcile as a safety net (fetch only the backlog, never a full
      // reconnect) so a silently-dead stream still converges.
      this.refreshTimer = setInterval(
        () => void this.reconcile(),
        this.config.refreshInterval
      );
    }
  }

  /** Fetch the full snapshot + current version (initial load). */
  private async bootstrap(): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/api/client/flags`, {
      headers: { "X-SDK-Key": this.config.sdkKey },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch flags: ${res.status}`);
    }
    const data = await res.json();
    this.flags.clear();
    for (const flag of data.flags) {
      this.flags.set(flag.key, flag);
    }
    if (typeof data.config_version === "number") {
      this.configVersion = data.config_version;
    }
  }

  isEnabled(flagKey: string, userId: string): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;
    if (!flag.enabled) return false;
    if (flag.targeted_users.includes(userId)) return true;
    return this.isInRollout(flagKey, userId, flag.rollout_percentage);
  }

  getAllFlags(): Map<string, FlagConfig> {
    return this.flags;
  }

  /** The highest global config version this client has applied. */
  getConfigVersion(): number {
    return this.configVersion;
  }

  /** True if the server's version is ahead of what this client has applied. */
  isStale(serverVersion: number): boolean {
    return serverVersion > this.configVersion;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onUpdate(callback: (flags: Map<string, FlagConfig>) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onStatus(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  /** Simulate an outage: close the stream and stop auto-reconnecting. */
  disconnect(): void {
    this.manuallyClosed = true;
    this.closeStream();
    this.setStatus("offline");
  }

  /** Re-open the stream after a disconnect; onopen then reconciles the gap. */
  reconnect(): void {
    this.manuallyClosed = false;
    this.setStatus("reconnecting");
    this.connectSSE();
  }

  destroy(): void {
    this.manuallyClosed = true;
    this.closeStream();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.listeners.clear();
    this.statusListeners.clear();
    this.setStatus("offline");
  }

  private isInRollout(
    flagKey: string,
    userId: string,
    percentage: number
  ): boolean {
    if (percentage <= 0) return false;
    if (percentage >= 100) return true;
    const hash = fnv1a32(`${flagKey}:${userId}`);
    return hash % 100 < percentage;
  }

  private closeStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private connectSSE(): void {
    // Always close the old stream before opening a new one — otherwise each
    // reconnect/refresh leaks an EventSource (the original bug).
    this.closeStream();

    const url = `${this.config.baseUrl}/api/client/stream?key=${this.config.sdkKey}`;
    const es = new EventSource(url);
    this.eventSource = es;

    es.onopen = () => {
      // On every (re)connect, reconcile any events missed while disconnected.
      void this.reconcile();
    };

    es.addEventListener("flag_updated", (e: MessageEvent) => {
      const version = this.eventVersion(e);
      const flag = JSON.parse(e.data) as FlagConfig;
      this.applyEvent(version, () => this.flags.set(flag.key, flag));
    });

    es.addEventListener("flag_deleted", (e: MessageEvent) => {
      const version = this.eventVersion(e);
      const { key } = JSON.parse(e.data) as { key: string };
      this.applyEvent(version, () => this.flags.delete(key));
    });

    es.onerror = () => {
      // The browser auto-reconnects unless we closed on purpose; reflect the
      // gap in status. onopen will fire again and trigger a reconcile.
      if (this.manuallyClosed) return;
      this.closeStreamIfClosed(es);
      this.setStatus("reconnecting");
    };
  }

  // If the browser gave up (readyState CLOSED), drop our reference so a later
  // reconnect() opens cleanly.
  private closeStreamIfClosed(es: EventSource): void {
    if (es.readyState === EventSource.CLOSED && this.eventSource === es) {
      this.eventSource = null;
    }
  }

  /** Version carried by the SSE `id:` field (authoritative for gap detection). */
  private eventVersion(e: MessageEvent): number {
    const v = parseInt(e.lastEventId, 10);
    return Number.isFinite(v) ? v : this.configVersion + 1;
  }

  // applyEvent enforces contiguity: apply only the exact next version; ignore
  // stale/duplicate (<= current); on a gap (> current+1) trigger a reconcile.
  private applyEvent(version: number, mutate: () => void): void {
    if (version <= this.configVersion) return; // stale or duplicate
    if (version > this.configVersion + 1) {
      void this.reconcile(); // missed at least one event — backfill in order
      return;
    }
    mutate();
    this.configVersion = version;
    this.setStatus("live");
    this.notifyListeners();
  }

  /**
   * Replay the ordered event backlog after our current version and apply each
   * in version order, converging to the latest committed state. Idempotent and
   * self-guarded so overlapping triggers (reconnect + gap) don't double-run.
   */
  async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    const prevStatus = this.status;
    this.setStatus("reconciling");
    try {
      let changed = false;
      // Page through the backlog: the server caps events per response, so keep
      // fetching from our advancing version until a page comes back empty. We
      // only ever advance to an applied event's version — never blindly to the
      // server's latest — so a multi-page backlog can't be skipped.
      for (let guard = 0; guard < 10000; guard++) {
        const res = await fetch(
          `${this.config.baseUrl}/api/client/events?since=${this.configVersion}`,
          { headers: { "X-SDK-Key": this.config.sdkKey } }
        );
        if (!res.ok) {
          this.setStatus(
            prevStatus === "reconciling" ? "reconnecting" : prevStatus
          );
          return;
        }
        const data = (await res.json()) as { events: FlagEvent[] };
        if (!data.events.length) break;
        let advanced = false;
        for (const ev of data.events) {
          if (ev.version <= this.configVersion) continue;
          if (ev.event_type === "deleted") {
            this.flags.delete(ev.flag_key);
          } else {
            this.flags.set(ev.flag_key, ev.payload as unknown as FlagConfig);
          }
          this.configVersion = ev.version;
          changed = true;
          advanced = true;
        }
        // No new version applied → caught up (also guards a non-filtering server).
        if (!advanced) break;
      }
      this.setStatus("live");
      if (changed) this.notifyListeners();
    } catch {
      this.setStatus("reconnecting");
    } finally {
      this.reconciling = false;
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.flags);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
