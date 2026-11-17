import { revokeOtherSessions } from "@/lib/server/sessions";

export const runtime = "nodejs";

export async function POST() {
  const result = await revokeOtherSessions();
  if (!result) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  return Response.json(result);
}
