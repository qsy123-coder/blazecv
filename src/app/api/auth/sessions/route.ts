import { listSessions } from "@/lib/server/sessions";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await listSessions();
  if (!sessions) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  return Response.json(
    { sessions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
