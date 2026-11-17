import {
  getCurrentUser,
  hashPassword,
  isValidPassword,
  verifyPassword,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const limit = checkRateLimit(
    clientKey(request, `password:${user.id}`),
    10,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return Response.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const source = (body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const currentPassword =
    typeof source.currentPassword === "string" ? source.currentPassword : "";
  const newPassword = typeof source.newPassword === "string" ? source.newPassword : "";

  if (!isValidPassword(newPassword)) {
    return Response.json(
      { error: "新密码至少 8 位，且不超过 72 字节" },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return Response.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
  }

  const database = await getDb();
  const result = await database.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [user.id],
  );
  const row = result.rows[0];
  if (!row) {
    return Response.json({ error: "账号不存在" }, { status: 404 });
  }
  if (!row.password_hash) {
    return Response.json(
      { error: "该账号使用验证码登录，尚未设置密码" },
      { status: 400 },
    );
  }
  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    return Response.json({ error: "当前密码错误" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await database.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
    user.id,
    passwordHash,
  ]);

  return Response.json({ ok: true });
}
