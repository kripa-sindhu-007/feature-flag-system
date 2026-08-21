"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const SDK_KEY = process.env.NEXT_PUBLIC_SDK_KEY || "sdk-secret-key";

// The load balancer hides individual nodes, so the panel polls each backend
// directly. Falls back to the single API URL when no cluster is configured.
const NODE_URLS: string[] = (process.env.NEXT_PUBLIC_NODE_URLS || API_URL)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export interface NodeState {
  url: string;
  nodeId: string;
  configVersion: number | null;
  sseClients: number | null;
  ok: boolean;
}

export interface ClusterState {
  nodes: NodeState[];
  /** Highest config version seen across reachable nodes. */
  latestVersion: number;
  /** True when every reachable node reports the same version. */
  converged: boolean;
  reachableCount: number;
}

async function fetchNode(url: string): Promise<NodeState> {
  try {
    const res = await fetch(`${url}/api/client/version`, {
      headers: { "X-SDK-Key": SDK_KEY },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return {
      url,
      nodeId: data.node_id ?? url,
      configVersion: typeof data.config_version === "number" ? data.config_version : null,
      sseClients: typeof data.sse_clients === "number" ? data.sse_clients : null,
      ok: true,
    };
  } catch {
    return { url, nodeId: url, configVersion: null, sseClients: null, ok: false };
  }
}

export function useCluster(): UseQueryResult<ClusterState> {
  return useQuery({
    queryKey: ["cluster"],
    queryFn: async (): Promise<ClusterState> => {
      const nodes = await Promise.all(NODE_URLS.map(fetchNode));
      const versions = nodes
        .filter((n) => n.ok && n.configVersion !== null)
        .map((n) => n.configVersion as number);
      const latestVersion = versions.length ? Math.max(...versions) : 0;
      const converged =
        versions.length > 0 && versions.every((v) => v === versions[0]);
      return {
        nodes,
        latestVersion,
        converged,
        reachableCount: nodes.filter((n) => n.ok).length,
      };
    },
    refetchInterval: 1500,
  });
}
