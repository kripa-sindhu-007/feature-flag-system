import { FlagConfig } from "@/types/flag";

interface SDKConfig {
  baseUrl: string;
  sdkKey: string;
  refreshInterval?: number;
}

function fnv1a32(input: string): number {
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
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SDKConfig) {
    this.config = config;
    this.flags = new Map();
    this.listeners = new Set();
  }

  async init(): Promise<void> {
    const res = await fetch(
      `${this.config.baseUrl}/api/client/flags`,
      {
        headers: { "X-SDK-Key": this.config.sdkKey },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch flags: ${res.status}`);
    }

    const data = await res.json();
    this.flags.clear();
    for (const flag of data.flags) {
      this.flags.set(flag.key, flag);
    }

    this.connectSSE();

    if (this.config.refreshInterval) {
      this.refreshTimer = setInterval(
        () => this.init(),
        this.config.refreshInterval
      );
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

  onUpdate(
    callback: (flags: Map<string, FlagConfig>) => void
  ): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.listeners.clear();
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

  private connectSSE(): void {
    const url = `${this.config.baseUrl}/api/client/stream?key=${this.config.sdkKey}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener("flag_updated", (e: MessageEvent) => {
      const flag: FlagConfig = JSON.parse(e.data);
      this.flags.set(flag.key, flag);
      this.notifyListeners();
    });

    this.eventSource.addEventListener("flag_deleted", (e: MessageEvent) => {
      const { key } = JSON.parse(e.data);
      this.flags.delete(key);
      this.notifyListeners();
    });

    this.eventSource.onerror = () => {
      // EventSource auto-reconnects by default
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.flags);
    }
  }
}
