import {
  allowedEmailText,
  hashPassword,
  isAllowedEmail,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  parseIdentifier,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";
import { verifyCode } from "@/lib/server/verify-code";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, "reset"), 20, 10 * 60 * 1000);
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
    account?: unknown;
    code?: unknown;
    password?: unknown;
  };
  const rawAccount = typeof source.account === "string" ? source.account : "";
  const code = typeof source.code === "string" ? source.code.trim() : "";
  const password = typeof source.password === "string" ? source.password : "";

  const account = parseIdentifier(rawAccount);
  if (account.kind === "phone" && !isValidPhone(account.value)) {
    return Response.json({ error: "请输入 11 位手机号" }, { status: 400 });
  }
  if (account.kind === "email") {
    if (!isValidEmail(account.value)) {
      return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }
    if (!isAllowedEmail(account.value)) {
      return Response.json({ error: allowedEmailText() }, { status: 400 });
    }
  }
  if (!code) {
    return Response.json({ error: "请输入验证码" }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return Response.json(
      { error: "密码至少 8 位，且不超过 72 字节" },
      { status: 400 },
    );
  }

  const verified = await verifyCode(account.value, "reset", code);
  if (!verified.ok) {
    return Response.json(
      {
        error:
          verified.reason === "too_many"
            ? "验证码错误次数过多，请重新获取"
            : "验证码错误或已过期",
      },
      { status: 401 },
    );
  }

  const database = await getDb();
  const passwordHash = await hashPassword(password);
  const updated =
    account.kind === "phone"
      ? await database.query(
          "UPDATE users SET password_hash = $2 WHERE phone = $1 RETURNING id",
          [account.value, passwordHash],
        )
      : await database.query(
          "UPDATE users SET password_hash = $2 WHERE email = $1 RETURNING id",
          [account.value, passwordHash],
        );

  if (updated.rows.length === 0) {
    return Response.json({ error: "账号不存在，请先注册" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
