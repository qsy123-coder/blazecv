import {
  allowedEmailText,
  createSession,
  hashPassword,
  isAllowedEmail,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  newUserId,
  parseIdentifier,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, "register"), 30, 10 * 60 * 1000);
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

  const source = (body ?? {}) as {
    account?: unknown;
    identifier?: unknown;
    email?: unknown;
    phone?: unknown;
    password?: unknown;
  };
  const rawAccount = [source.account, source.identifier, source.phone, source.email]
    .find((value): value is string => typeof value === "string" && value.trim() !== "");
  const password = typeof source.password === "string" ? source.password : "";

  if (!rawAccount) {
    return Response.json({ error: "请输入手机号或邮箱" }, { status: 400 });
  }

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
  if (!isValidPassword(password)) {
    return Response.json({ error: "密码至少 8 位，且不超过 72 字节" }, { status: 400 });
  }

  const database = await getDb();
  const duplicateMessage =
    account.kind === "phone" ? "该手机号已注册，请直接登录" : "该邮箱已注册，请直接登录";
  const existing =
    account.kind === "phone"
      ? await database.query("SELECT id FROM users WHERE phone = $1", [account.value])
      : await database.query("SELECT id FROM users WHERE email = $1", [account.value]);
  if (existing.rows.length > 0) {
    return Response.json({ error: duplicateMessage }, { status: 409 });
  }

  const userId = newUserId();
  const passwordHash = await hashPassword(password);
  const email = account.kind === "email" ? account.value : null;
  const phone = account.kind === "phone" ? account.value : null;

  try {
    await database.query(
      "INSERT INTO users (id, email, phone, password_hash) VALUES ($1, $2, $3, $4)",
      [userId, email, phone, passwordHash],
    );
  } catch {
    return Response.json({ error: duplicateMessage }, { status: 409 });
  }

  await createSession(userId, request.headers.get("user-agent"));
  return Response.json({
    user: { id: userId, email, phone, hasPassword: true },
  });
}
