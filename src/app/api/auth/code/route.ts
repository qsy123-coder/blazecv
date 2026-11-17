import {
  allowedEmailText,
  isAllowedEmail,
  isValidEmail,
  isValidPhone,
  parseIdentifier,
} from "@/lib/server/auth";
import { EmailError, sendVerifyEmail } from "@/lib/server/email";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";
import { SmsError, sendSmsCode } from "@/lib/server/sms";
import {
  CODE_RESEND_SECONDS,
  CODE_TTL_SECONDS,
  discardCode,
  issueCode,
  type CodePurpose,
} from "@/lib/server/verify-code";

export const runtime = "nodejs";

type RequestPurpose = "login" | "reset";

export async function POST(request: Request) {
  // 同一 IP 每小时最多触发 20 次发送，同一账号 10 分钟内最多 5 次。
  const ipLimit = checkRateLimit(clientKey(request, "code"), 20, 60 * 60 * 1000);
  if (!ipLimit.ok) {
    return Response.json(
      { error: "验证码请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const source = (body ?? {}) as { account?: unknown; purpose?: unknown };
  const rawAccount = typeof source.account === "string" ? source.account : "";
  const rawPurpose = typeof source.purpose === "string" ? source.purpose : "login";
  if (rawPurpose !== "login" && rawPurpose !== "reset") {
    return Response.json({ error: "不支持的验证码用途" }, { status: 400 });
  }
  const purpose: CodePurpose = rawPurpose as RequestPurpose;
  const account = parseIdentifier(rawAccount);

  if (account.kind === "phone") {
    if (!isValidPhone(account.value)) {
      return Response.json({ error: "请输入 11 位手机号" }, { status: 400 });
    }
  } else {
    if (!isValidEmail(account.value)) {
      return Response.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }
    if (!isAllowedEmail(account.value)) {
      return Response.json({ error: allowedEmailText() }, { status: 400 });
    }
    // 邮箱只用于重置密码；登录仍走邮箱 + 密码。
    if (purpose !== "reset") {
      return Response.json(
        { error: "邮箱账号请使用密码登录，忘记密码可选择重置" },
        { status: 400 },
      );
    }
  }

  const accountLimit = checkRateLimit(
    `code:${account.value}`,
    5,
    10 * 60 * 1000,
  );
  if (!accountLimit.ok) {
    return Response.json(
      { error: "该账号验证码发送过于频繁，请稍后再试" },
      {
        status: 429,
        headers: { "Retry-After": String(accountLimit.retryAfter) },
      },
    );
  }

  const issued = await issueCode(account.value, purpose);
  if ("retryAfter" in issued) {
    return Response.json(
      { error: `请 ${issued.retryAfter} 秒后再获取验证码`, retryAfter: issued.retryAfter },
      { status: 429, headers: { "Retry-After": String(issued.retryAfter) } },
    );
  }

  try {
    if (account.kind === "phone") {
      await sendSmsCode(account.value, issued.code, CODE_TTL_SECONDS);
    } else {
      await sendVerifyEmail(
        account.value,
        issued.code,
        "reset",
        CODE_TTL_SECONDS,
      );
    }
  } catch (error) {
    await discardCode(issued.id);
    if (error instanceof SmsError || error instanceof EmailError) {
      const channel = account.kind === "phone" ? "短信" : "邮件";
      if (error.kind === "config") {
        console.error(`[${account.kind === "phone" ? "sms" : "email"}] 配置缺失：`, error.message);
        return Response.json(
          { error: `${channel}服务暂未开通，请稍后再试` },
          { status: 503 },
        );
      }
    }
    console.error("[code] 发送失败：", error);
    return Response.json(
      { error: "验证码发送失败，请稍后重试" },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    expiresIn: CODE_TTL_SECONDS,
    resendIn: CODE_RESEND_SECONDS,
  });
}
