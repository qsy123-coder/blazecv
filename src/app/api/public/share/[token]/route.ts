import bcrypt from "bcryptjs";
import type { ResumeDoc } from "@/lib/types";
import { parseResumeObject } from "@/lib/schema";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function notFound() {
  return Response.json(
    { error: "链接无效或已过期" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return notFound();

  const limit = checkRateLimit(
    `${clientKey(request, "share-unlock")}:${token}`,
    10,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return Response.json(
      { error: "尝试过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }
  const password =
    typeof (body as { password?: unknown } | null)?.password === "string"
      ? ((body as { password: string }).password)
      : "";

  const database = await getDb();
  const result = await database.query<{
    doc: unknown;
    password_hash: string | null;
    expires_at: unknown;
  }>("SELECT doc, password_hash, expires_at FROM shares WHERE token = $1", [
    token,
  ]);
  const row = result.rows[0];
  if (!row) return notFound();

  if (row.expires_at) {
    const expiresAt = new Date(String(row.expires_at)).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return notFound();
  }

  if (row.password_hash) {
    if (!password || !(await bcrypt.compare(password, row.password_hash))) {
      return Response.json(
        { error: "访问密码错误" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const parsed = parseResumeObject(
    typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc,
  );
  if (!parsed.ok) return notFound();

  return Response.json(
    { doc: parsed.doc satisfies ResumeDoc },
    { headers: { "Cache-Control": "no-store" } },
  );
}
