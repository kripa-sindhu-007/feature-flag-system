"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { FlagEvent } from "@/types/flag";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

export interface EventsResult {
  events: FlagEvent[];
  configVersion: number;
}

/**
 * Recent entries from the durable flag-events log — the real history behind the
 * version timeline. The reconcile endpoint (`/api/client/events?since=V`) returns
 * events *after* V in ascending order (capped 1000), so to show the most recent
 * `window` we ask for `since = latest - window`. Pass `latest` (e.g. from
 * `useFlags().config_version` or the cluster's latest) so the query refetches as
 * new versions land.
 */
export function useEvents(
  latest: number,
  window = 40
): UseQueryResult<EventsResult> {
  return useQuery({
    queryKey: ["events", latest, window],
    enabled: latest > 0,
    queryFn: async (): Promise<EventsResult> => {
      const since = Math.max(0, latest - window);
      const res = await fetch(`${API_URL}/api/client/events?since=${since}`, {
        headers: { "X-SDK-Key": SDK_KEY },
      });
      if (!res.ok) throw new Error(`events ${res.status}`);
      const data = await res.json();
      const events: FlagEvent[] = Array.isArray(data.events) ? data.events : [];
      return {
        events,
        configVersion:
          typeof data.config_version === "number" ? data.config_version : latest,
      };
    },
    // Keep prior events visible while the next window loads (no flash to empty).
    placeholderData: (prev) => prev,
    staleTime: 1000,
  });
}
