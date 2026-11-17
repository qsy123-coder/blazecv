import { revokeSession } from "@/lib/server/sessions";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await revokeSession(id);
  if (!result) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  if (!result.ok) {
    return Response.json({ error: "会话不存在或已失效" }, { status: 404 });
  }
  return Response.json(result);
}
