import {
  allowedEmailText,
  createSession,
  isAllowedEmail,
  isValidEmail,
  isValidPhone,
  newUserId,
  parseIdentifier,
  verifyPassword,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";
import { verifyCode } from "@/lib/server/verify-code";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
};

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request, "login"), 30, 10 * 60 * 1000);
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
    code?: unknown;
  };
  const rawAccount = [source.account, source.identifier, source.phone, source.email]
    .find((value): value is string => typeof value === "string" && value.trim() !== "");
  const password = typeof source.password === "string" ? source.password : "";
  const code = typeof source.code === "string" ? source.code.trim() : "";

  if (!rawAccount) {
    return Response.json({ error: "请输入手机号或邮箱" }, { status: 400 });
  }
  if (!password && !code) {
    return Response.json({ error: "请输入验证码或密码" }, { status: 400 });
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

  const database = await getDb();

  // ---------- 手机号 + 短信验证码 ----------
  if (code) {
    if (account.kind !== "phone") {
      return Response.json({ error: "邮箱账号请使用密码登录" }, { status: 400 });
    }

    const verified = await verifyCode(account.value, "login", code);
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

    const found = await database.query<UserRow>(
      "SELECT id, email, phone, password_hash FROM users WHERE phone = $1",
      [account.value],
    );
    let user = found.rows[0];

    // 手机号验证码登录即注册：首次登录自动创建账号。
    if (!user) {
      const userId = newUserId();
      try {
        await database.query(
          "INSERT INTO users (id, email, phone, password_hash) VALUES ($1, NULL, $2, NULL)",
          [userId, account.value],
        );
      } catch {
        // 并发下另一个请求已创建该手机号，回读即可
      }
      const created = await database.query<UserRow>(
        "SELECT id, email, phone, password_hash FROM users WHERE phone = $1",
        [account.value],
      );
      user = created.rows[0];
      if (!user) {
        return Response.json({ error: "账号创建失败，请重试" }, { status: 500 });
      }
    }

    await createSession(user.id, request.headers.get("user-agent"));
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        hasPassword: user.password_hash !== null,
      },
    });
  }

  // ---------- 邮箱 / 密码 ----------
  const result =
    account.kind === "phone"
      ? await database.query<UserRow>(
          "SELECT id, email, phone, password_hash FROM users WHERE phone = $1",
          [account.value],
        )
      : await database.query<UserRow>(
          "SELECT id, email, phone, password_hash FROM users WHERE email = $1",
          [account.value],
        );
  const user = result.rows[0];

  if (user && !user.password_hash) {
    return Response.json(
      { error: "该账号未设置密码，请使用短信验证码登录" },
      { status: 400 },
    );
  }
  if (!user || !(await verifyPassword(password, user.password_hash!))) {
    return Response.json(
      { error: account.kind === "phone" ? "手机号或密码错误" : "邮箱或密码错误" },
      { status: 401 },
    );
  }

  await createSession(user.id, request.headers.get("user-agent"));
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      hasPassword: user.password_hash !== null,
    },
  });
}
