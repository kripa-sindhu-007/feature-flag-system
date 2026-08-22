import type { NextRequest } from "next/server";
import { proxyAdmin } from "@/lib/admin-proxy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return proxyAdmin(req, `/api/admin/flags/${encodeURIComponent(id)}/toggle`);
}
