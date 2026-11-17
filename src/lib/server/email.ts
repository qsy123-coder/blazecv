export type EmailErrorKind = "config" | "provider";

export class EmailError extends Error {
  constructor(
    message: string,
    readonly kind: EmailErrorKind,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

export type EmailProvider = "smtp" | "http" | "console";
export type EmailPurpose = "reset" | "login" | "register";

function emailProvider(): EmailProvider {
  const value = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (value === "smtp" || value === "http") return value;
  // console 仅用于本地联调，必须显式设置。
  if (value === "console") return value;
  throw new EmailError(
    "邮件服务未配置：请设置 EMAIL_PROVIDER=smtp|http 及对应参数",
    "config",
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new EmailError(`缺少环境变量 ${name}`, "config");
  }
  return value.trim();
}

function minutesOf(ttlSeconds: number): number {
  return Math.max(1, Math.round(ttlSeconds / 60));
}

function contentFor(purpose: EmailPurpose, code: string, ttlSeconds: number) {
  const minutes = minutesOf(ttlSeconds);
  const titles: Record<EmailPurpose, string> = {
    reset: "BlazeCV 密码重置验证码",
    login: "BlazeCV 登录验证码",
    register: "BlazeCV 邮箱验证码",
  };
  const intros: Record<EmailPurpose, string> = {
    reset: "你正在重置 BlazeCV 账号密码，验证码为：",
    login: "你的 BlazeCV 登录验证码为：",
    register: "你的 BlazeCV 邮箱验证码为：",
  };
  const subject = titles[purpose];
  const text = [
    `你好，`,
    ``,
    intros[purpose],
    ``,
    `    ${code}`,
    ``,
    `验证码 ${minutes} 分钟内有效，仅可使用一次。`,
    purpose === "reset"
      ? "如果这不是你本人的操作，请忽略本邮件，账号密码不会被修改。"
      : "如果这不是你本人的操作，请忽略本邮件。",
    ``,
    `—— BlazeCV`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 8px;font-size:16px">${subject}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#475569">${intros[purpose]}</p>
    <div style="font-size:30px;font-weight:700;letter-spacing:8px;background:#f1f5f9;border-radius:8px;padding:14px;text-align:center">${code}</div>
    <p style="margin:16px 0 0;font-size:12px;color:#64748b">验证码 ${minutes} 分钟内有效，仅可使用一次。</p>
    <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">${
      purpose === "reset"
        ? "如果这不是你本人的操作，请忽略本邮件，账号密码不会被修改。"
        : "如果这不是你本人的操作，请忽略本邮件。"
    }</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 12px" />
    <p style="margin:0;font-size:11px;color:#94a3b8">BlazeCV · 在线简历</p>
  </div>
</body></html>`;
  return { subject, text, html };
}

async function sendViaSmtp(
  to: string,
  content: { subject: string; text: string; html: string },
): Promise<void> {
  const host = requireEnv("EMAIL_SMTP_HOST");
  const port = Number(process.env.EMAIL_SMTP_PORT ?? 587);
  const secure = (process.env.EMAIL_SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = process.env.EMAIL_SMTP_USER?.trim();
  const pass = process.env.EMAIL_SMTP_PASS ?? "";
  const from = process.env.EMAIL_FROM?.trim() || user || "";
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "BlazeCV";
  const rejectUnauthorized =
    (process.env.EMAIL_SMTP_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false";

  if (!from) {
    throw new EmailError("缺少环境变量 EMAIL_FROM", "config");
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  } catch (error) {
    throw new EmailError(
      `SMTP 发送失败：${(error as Error).message}`,
      "provider",
    );
  } finally {
    transporter.close();
  }
}

/** 通用 HTTP 邮件网关：POST JSON，非 2xx 视为失败。 */
async function sendViaHttp(
  to: string,
  code: string,
  purpose: EmailPurpose,
  ttlSeconds: number,
  content: { subject: string; text: string; html: string },
): Promise<void> {
  const url = requireEnv("EMAIL_HTTP_URL");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.EMAIL_HTTP_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      code,
      purpose,
      expiresIn: ttlSeconds,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailError(
      `邮件网关返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`,
      "provider",
    );
  }
}

/** 发送邮箱验证码。凭据缺失抛 config 错误，发送失败抛 provider 错误。 */
export async function sendVerifyEmail(
  to: string,
  code: string,
  purpose: EmailPurpose,
  ttlSeconds: number,
): Promise<void> {
  const provider = emailProvider();
  const content = contentFor(purpose, code, ttlSeconds);

  switch (provider) {
    case "smtp":
      return sendViaSmtp(to, content);
    case "http":
      return sendViaHttp(to, code, purpose, ttlSeconds, content);
    case "console":
      console.info(
        `[email:console] ${to} ${content.subject} 验证码 ${code}，${minutesOf(ttlSeconds)} 分钟内有效`,
      );
      return;
  }
}
