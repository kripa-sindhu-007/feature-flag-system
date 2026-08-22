"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Same node-discovery mechanism the cluster panel uses: the LB hides individual
// nodes, so we poll each backend's /readyz directly. NODE_URLS is baked at build.
const NODE_URLS: string[] = (process.env.NEXT_PUBLIC_NODE_URLS || API_URL)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

const PROMETHEUS_URL =
  process.env.NEXT_PUBLIC_PROMETHEUS_URL || "http://localhost:9090";

export interface NodeReadiness {
  url: string;
  nodeId: string;
  ready: boolean;
  /** True when the node responded at all (even a 503 unready). */
  reachable: boolean;
  postgres: string | null;
  redis: string | null;
  configVersion: number | null;
}

async function fetchReadyz(url: string): Promise<NodeReadiness> {
  try {
    // /readyz returns 200 when ready, 503 when unready — both carry a JSON body.
    const res = await fetch(`${url}/readyz`);
    const data = await res.json().catch(() => ({}));
    return {
      url,
      nodeId: data.node_id ?? url,
      ready: data.ready === true,
      reachable: true,
      postgres: typeof data.postgres === "string" ? data.postgres : null,
      redis: typeof data.redis === "string" ? data.redis : null,
      configVersion:
        typeof data.config_version === "number" ? data.config_version : null,
    };
  } catch {
    return {
      url,
      nodeId: url,
      ready: false,
      reachable: false,
      postgres: null,
      redis: null,
      configVersion: null,
    };
  }
}

// Default 4s for the Health page; the Resilience view passes a faster interval
// so a chaos-injected node drop/return is visible near-live.
export function useReadiness(
  refetchInterval = 4000
): UseQueryResult<NodeReadiness[]> {
  return useQuery({
    queryKey: ["readiness"],
    queryFn: () => Promise.all(NODE_URLS.map(fetchReadyz)),
    refetchInterval,
  });
}

export interface FleetMetrics {
  /** Fleet-wide live SSE client count, or null when Prometheus is unreachable. */
  sseClients: number | null;
  /** Propagation latency quantiles in seconds, or null when unavailable. */
  propagationP50: number | null;
  propagationP95: number | null;
  propagationP99: number | null;
  /** True when the Prometheus query API could not be reached at all. */
  unavailable: boolean;
}

async function promScalar(query: string): Promise<number | null> {
  const res = await fetch(
    `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const result = json?.data?.result;
  if (!Array.isArray(result) || result.length === 0) return null;
  const raw = result[0]?.value?.[1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const P = (q: number) =>
  `histogram_quantile(${q}, sum(rate(config_propagation_seconds_bucket[5m])) by (le))`;

export interface RedisPublishErrors {
  /** Cumulative redis publish errors across the fleet, or null when unavailable. */
  total: number | null;
  /** True when Prometheus could not be reached. */
  unavailable: boolean;
}

/**
 * redis_publish_errors_total is the propagation-path health signal: it climbs
 * while Redis is unreachable (chaos/redis-down) — writes still succeed against
 * Postgres (durable source of truth), but cross-node fan-out is degraded until
 * reconnect. Polled fast so the Resilience view reflects a `redis-down` window.
 */
export function useRedisPublishErrors(): UseQueryResult<RedisPublishErrors> {
  return useQuery({
    queryKey: ["redis-publish-errors"],
    queryFn: async (): Promise<RedisPublishErrors> => {
      try {
        const total = await promScalar("sum(redis_publish_errors_total)");
        return { total: total ?? 0, unavailable: false };
      } catch {
        return { total: null, unavailable: true };
      }
    },
    refetchInterval: 2000,
    retry: false,
  });
}

export function useFleetMetrics(): UseQueryResult<FleetMetrics> {
  return useQuery({
    queryKey: ["fleet-metrics"],
    queryFn: async (): Promise<FleetMetrics> => {
      try {
        const [sse, p50, p95, p99] = await Promise.all([
          promScalar("sum(sse_connected_clients)"),
          promScalar(P(0.5)),
          promScalar(P(0.95)),
          promScalar(P(0.99)),
        ]);
        return {
          sseClients: sse,
          propagationP50: p50,
          propagationP95: p95,
          propagationP99: p99,
          unavailable: false,
        };
      } catch {
        // Prometheus down: readiness tiles still work; metric tiles degrade.
        return {
          sseClients: null,
          propagationP50: null,
          propagationP95: null,
          propagationP99: null,
          unavailable: true,
        };
      }
    },
    refetchInterval: 5000,
    retry: false,
  });
}
