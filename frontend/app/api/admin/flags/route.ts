import type { NextRequest } from "next/server";
import { proxyAdmin } from "@/lib/admin-proxy";

// Always run server-side, never cached — these are live admin reads/writes.
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return proxyAdmin(req, "/api/admin/flags");
}

export function POST(req: NextRequest) {
  return proxyAdmin(req, "/api/admin/flags");
}
