import { createHash, createHmac, randomUUID } from "node:crypto";

export type SmsErrorKind = "config" | "provider";

export class SmsError extends Error {
  constructor(
    message: string,
    readonly kind: SmsErrorKind,
  ) {
    super(message);
    this.name = "SmsError";
  }
}

export type SmsProvider = "aliyun" | "tencent" | "http" | "console";

export function smsProvider(): SmsProvider {
  const value = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (value === "aliyun" || value === "tencent" || value === "http") return value;
  // console 仅用于本地联调，必须显式设置，绝不作为默认值。
  if (value === "console") return "console";
  throw new SmsError(
    "短信服务未配置：请设置 SMS_PROVIDER=aliyun|tencent|http 及对应凭据",
    "config",
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new SmsError(`缺少环境变量 ${name}`, "config");
  }
  return value.trim();
}

/** RFC 3986 百分号编码（阿里云 RPC 签名要求）。 */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function minutesOf(ttlSeconds: number): number {
  return Math.max(1, Math.round(ttlSeconds / 60));
}

function aliyunTemplateParam(code: string, ttlSeconds: number): string {
  const template = process.env.ALIYUN_SMS_TEMPLATE_PARAM?.trim() || '{"code":"{{code}}"}';
  return template
    .replaceAll("{{code}}", code)
    .replaceAll("{{minutes}}", String(minutesOf(ttlSeconds)));
}

/** 腾讯云模板变量按位置传入，变量个数必须与模板完全一致。 */
function tencentTemplateParams(code: string, ttlSeconds: number): string[] {
  const template =
    process.env.TENCENT_SMS_TEMPLATE_PARAMS?.trim() || "{{code}},{{minutes}}";
  return template.split(",").map((value) =>
    value
      .trim()
      .replaceAll("{{code}}", code)
      .replaceAll("{{minutes}}", String(minutesOf(ttlSeconds))),
  );
}

async function sendViaAliyun(
  phone: string,
  code: string,
  ttlSeconds: number,
): Promise<void> {
  const accessKeyId = requireEnv("ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = requireEnv("ALIYUN_SMS_ACCESS_KEY_SECRET");
  const signName = requireEnv("ALIYUN_SMS_SIGN_NAME");
  const templateCode = requireEnv("ALIYUN_SMS_TEMPLATE_CODE");

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: process.env.ALIYUN_SMS_REGION?.trim() || "cn-hangzhou",
    SignName: signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: templateCode,
    TemplateParam: aliyunTemplateParam(code, ttlSeconds),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(canonicalQuery)}`;
  const signature = createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  const body = new URLSearchParams({ ...params, Signature: signature });
  const response = await fetch("https://dysmsapi.aliyuncs.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as {
    Code?: string;
    Message?: string;
  };
  if (!response.ok || data.Code !== "OK") {
    throw new SmsError(
      `阿里云短信发送失败：${data.Code ?? response.status} ${data.Message ?? ""}`.trim(),
      "provider",
    );
  }
}

async function sendViaTencent(
  phone: string,
  code: string,
  ttlSeconds: number,
): Promise<void> {
  const secretId = requireEnv("TENCENT_SMS_SECRET_ID");
  const secretKey = requireEnv("TENCENT_SMS_SECRET_KEY");
  const sdkAppId = requireEnv("TENCENT_SMS_SDK_APP_ID");
  const signName = requireEnv("TENCENT_SMS_SIGN_NAME");
  const templateId = requireEnv("TENCENT_SMS_TEMPLATE_ID");
  const region = process.env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou";

  const host = "sms.tencentcloudapi.com";
  const service = "sms";
  const action = "SendSms";
  const version = "2021-01-11";
  const contentType = "application/json; charset=utf-8";
  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: tencentTemplateParams(code, ttlSeconds),
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const sha256Hex = (value: string) =>
    createHash("sha256").update(value).digest("hex");

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const hmac = (key: Buffer | string, value: string) =>
    createHmac("sha256", key).update(value).digest();
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": version,
      "X-TC-Region": region,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as {
    Response?: {
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const status = data.Response?.SendStatusSet?.[0];
  if (
    !response.ok ||
    data.Response?.Error ||
    !status ||
    status.Code !== "Ok"
  ) {
    const reason =
      data.Response?.Error?.Message ?? status?.Message ?? String(response.status);
    throw new SmsError(`腾讯云短信发送失败：${reason}`, "provider");
  }
}

/**
 * 通用 HTTP 短信网关：POST JSON { phone, phoneE164, code, expiresIn }，
 * 非 2xx 视为失败。适合自建网关或长尾服务商。
 */
async function sendViaHttp(
  phone: string,
  code: string,
  ttlSeconds: number,
): Promise<void> {
  const url = requireEnv("SMS_HTTP_URL");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.SMS_HTTP_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone,
      phoneE164: `+86${phone}`,
      code,
      expiresIn: ttlSeconds,
      template: process.env.SMS_HTTP_TEMPLATE?.trim() || undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SmsError(
      `短信网关返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`,
      "provider",
    );
  }
}

/** 发送登录验证码。凭据缺失抛 config 错误，供应商失败抛 provider 错误。 */
export async function sendSmsCode(
  phone: string,
  code: string,
  ttlSeconds: number,
): Promise<void> {
  const provider = smsProvider();
  switch (provider) {
    case "aliyun":
      return sendViaAliyun(phone, code, ttlSeconds);
    case "tencent":
      return sendViaTencent(phone, code, ttlSeconds);
    case "http":
      return sendViaHttp(phone, code, ttlSeconds);
    case "console":
      console.info(
        `[sms:console] ${phone} 验证码 ${code}，${minutesOf(ttlSeconds)} 分钟内有效`,
      );
      return;
  }
}
