import { destroySession } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST() {
  await destroySession();
  return Response.json({ ok: true });
}
