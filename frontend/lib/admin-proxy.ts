// SERVER-ONLY. This module injects the admin API key and must never be imported
// into a client component — it is used exclusively by the route handlers under
// app/api/admin/**. Those handlers run in the Next server process, which reaches
// the backend over the internal docker network (API_INTERNAL_URL), so the key
// (ADMIN_API_KEY) is read from the *non-public* server env and never ships to
// the browser bundle.
import type { NextRequest } from "next/server";

// Non-public server env. In docker-compose the Next server reaches the backend
// through the nginx LB on the docker network (http://lb:8080); for local
// `next dev` it falls back to the host-published LB port.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || "http://localhost:8080";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "admin-secret-key";

/**
 * Forward an admin mutation/read to the backend, injecting the admin API key
 * server-side. The backend's status and body are returned faithfully (including
 * 409 version conflicts and 5xx), and If-Match is passed through for optimistic
 * concurrency on updates.
 */
export async function proxyAdmin(
  req: NextRequest,
  backendPath: string
): Promise<Response> {
  const method = req.method;
  const headers: Record<string, string> = {
    "X-Admin-API-Key": ADMIN_API_KEY,
  };

  // Pass through If-Match so PUT keeps its optimistic-concurrency guard.
  const ifMatch = req.headers.get("if-match");
  if (ifMatch) headers["If-Match"] = ifMatch;

  let body: string | undefined;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    body = await req.text();
    if (body) headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}${backendPath}`, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    // Backend unreachable from the Next server (LB down, network partition).
    return Response.json(
      { message: "Upstream unreachable" },
      { status: 502 }
    );
  }

  // 204 No Content (delete) — nothing to relay.
  if (res.status === 204) {
    return new Response(null, { status: 204 });
  }

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") || "application/json",
    },
  });
}
