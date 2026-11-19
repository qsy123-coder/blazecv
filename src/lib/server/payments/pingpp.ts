import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  NativeOrderInput,
  NativeOrderResult,
  OrderQueryResult,
  PayProvider,
  RefundInput,
  RefundResult,
} from "./provider";

export class PingppConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Ping++ 配置不完整：${missing.join(", ")}`);
    this.name = "PingppConfigError";
    this.missing = missing;
  }
}

export class PingppApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Ping++ 接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "PingppApiError";
    this.status = status;
    this.code = code;
  }
}

export class PingppWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PingppWebhookError";
  }
}

export interface PingppCharge {
  id: string;
  object?: string;
  order_no: string;
  amount: number;
  paid?: boolean;
  refunded?: boolean;
  transaction_no?: string | null;
  failure_code?: string | null;
  failure_msg?: string | null;
  time_paid?: number | null;
  credential?: Record<string, string> | null;
}

interface PingppConfig {
  apiKey: string;
  appId: string;
  apiBase: string;
  wechatChannel: string;
  alipayChannel: string;
  subMchId: string | null;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function readPem(pathName: string, base64Name: string): string | null {
  const file = env(pathName);
  if (file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }
  const base64 = env(base64Name);
  if (base64) {
    try {
      return Buffer.from(base64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

export function pingppMissingConfig(): string[] {
  const missing: string[] = [];
  for (const name of ["PINGPP_API_KEY", "PINGPP_APP_ID"]) {
    if (!env(name)) missing.push(name);
  }
  if (!readPem("PINGPP_PRIVATE_KEY_PATH", "PINGPP_PRIVATE_KEY_BASE64")) {
    missing.push("PINGPP_PRIVATE_KEY_PATH|PINGPP_PRIVATE_KEY_BASE64");
  }
  if (!readPem("PINGPP_PUBLIC_KEY_PATH", "PINGPP_PUBLIC_KEY_BASE64")) {
    missing.push("PINGPP_PUBLIC_KEY_PATH|PINGPP_PUBLIC_KEY_BASE64");
  }
  return missing;
}

let cachedConfig: PingppConfig | null = null;

function loadConfig(): PingppConfig {
  if (cachedConfig) return cachedConfig;
  const missing = pingppMissingConfig();
  if (missing.length > 0) throw new PingppConfigError(missing);

  const privatePem = readPem(
    "PINGPP_PRIVATE_KEY_PATH",
    "PINGPP_PRIVATE_KEY_BASE64",
  );
  const publicPem = readPem(
    "PINGPP_PUBLIC_KEY_PATH",
    "PINGPP_PUBLIC_KEY_BASE64",
  );
  if (!privatePem || !publicPem) throw new PingppConfigError(missing);

  try {
    cachedConfig = {
      apiKey: env("PINGPP_API_KEY"),
      appId: env("PINGPP_APP_ID"),
      apiBase: (env("PINGPP_API_BASE") || "https://api.pingxx.com").replace(
        /\/$/,
        "",
      ),
      wechatChannel:
        env("PINGPP_WECHAT_CHANNEL") || env("PINGPP_CHANNEL") || "wx_pub_qr",
      alipayChannel: env("PINGPP_ALIPAY_CHANNEL") || "alipay_qr",
      subMchId: env("PINGPP_SUB_MCH_ID") || null,
      privateKey: createPrivateKey({ key: privatePem, format: "pem" }),
      publicKey: createPublicKey(publicPem),
    };
  } catch {
    throw new PingppConfigError(["PINGPP_*_KEY（PEM 解析失败）"]);
  }
  return cachedConfig;
}

interface PingppErrorBody {
  error?: { type?: string; message?: string; code?: string };
}

/**
 * Ping++ request signing (official Node SDK): RSA-SHA256 over
 * `body + fullPath + timestamp`, base64; auth is HTTP Basic `apiKey:`.
 */
async function apiRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const config = loadConfig();
  const fullPath = `/v1${path}`;
  const bodyText = method === "GET" ? "" : JSON.stringify(body ?? {});
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${bodyText}${fullPath}${timestamp}`, "utf8"),
    config.privateKey,
  ).toString("base64");

  const response = await fetch(`${config.apiBase}${fullPath}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=UTF-8",
      "Pingplusplus-Signature": signature,
      "Pingplusplus-Request-Timestamp": String(timestamp),
      "User-Agent": "Pingpp/v1 NodeBindings/2.1.7",
    },
    body: method === "GET" ? undefined : bodyText,
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new PingppApiError(response.status, "INVALID_RESPONSE");
  }

  const errorBody = data as PingppErrorBody;
  if (!response.ok || errorBody.error) {
    const code =
      errorBody.error?.type ?? errorBody.error?.code ?? errorBody.error?.message ?? "";
    throw new PingppApiError(response.status, String(code));
  }
  return data as T;
}

export class PingppProvider implements PayProvider {
  readonly id = "pingpp" as const;

  subMerchantId(): string | null {
    return loadConfig().subMchId;
  }

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const channelName =
      input.channel === "alipay" ? config.alipayChannel : config.wechatChannel;
    const charge = await apiRequest<PingppCharge>("POST", "/charges", {
      order_no: input.outTradeNo,
      app: { id: config.appId },
      channel: channelName,
      amount: input.amountFen,
      client_ip: input.clientIp || "127.0.0.1",
      currency: "cny",
      subject: input.description.slice(0, 32),
      body: input.description.slice(0, 128),
      time_expire: Math.floor(input.expiresAt.getTime() / 1000),
      ...(input.attach ? { metadata: { plan: input.attach } } : {}),
      ...(config.subMchId
        ? { extra: { sub_mch_id: config.subMchId } }
        : {}),
    });

    const codeUrl =
      charge.credential?.[channelName] ??
      (input.channel === "alipay"
        ? charge.credential?.alipay_qr
        : charge.credential?.wx_pub_qr) ??
      null;
    if (!codeUrl) throw new PingppApiError(502, "MISSING_CREDENTIAL");
    return { codeUrl, providerTradeNo: charge.id };
  }

  async queryOrder(
    outTradeNo: string,
    providerTradeNo?: string | null,
  ): Promise<OrderQueryResult> {
    if (!providerTradeNo) return { state: "unknown" };
    const charge = await apiRequest<PingppCharge>(
      "GET",
      `/charges/${encodeURIComponent(providerTradeNo)}`,
    );
    if (charge.order_no !== outTradeNo) return { state: "unknown" };
    if (charge.paid) {
      return {
        state: "paid",
        providerTradeNo: charge.id,
        amountFen: charge.amount,
      };
    }
    if (charge.failure_code) return { state: "closed" };
    return { state: "pending" };
  }

  async closeOrder(): Promise<void> {
    // Ping++ has no close-charge API; the charge expires at time_expire.
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!input.providerTradeNo) {
      throw new PingppApiError(400, "MISSING_CHARGE_ID");
    }
    const refund = await apiRequest<{
      id?: string;
      status?: string;
    }>(
      "POST",
      `/charges/${encodeURIComponent(input.providerTradeNo)}/refunds`,
      { amount: input.refundFen, description: input.reason },
    );
    return {
      refundId: refund.id ?? input.outRefundNo,
      state: refund.status ?? "processing",
    };
  }
}

export interface PingppWebhookResult {
  eventId: string;
  type: string;
  charge: PingppCharge;
  raw: unknown;
}

/** Ping++ webhook: RSA-SHA256 over the raw body, verified with the Ping++ public key. */
export async function parsePingppWebhook(
  rawBody: string,
  headers: Headers,
): Promise<PingppWebhookResult> {
  const config = loadConfig();
  const signature =
    headers.get("x-pingplusplus-signature") ??
    headers.get("X-Pingplusplus-Signature") ??
    "";
  if (!signature) throw new PingppWebhookError("缺少 x-pingplusplus-signature");

  const valid = verify(
    "RSA-SHA256",
    Buffer.from(rawBody, "utf8"),
    config.publicKey,
    Buffer.from(signature, "base64"),
  );
  if (!valid) throw new PingppWebhookError("Webhook 验签失败");

  let event: {
    id?: unknown;
    type?: unknown;
    data?: { object?: unknown };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    throw new PingppWebhookError("Webhook 报文不是合法 JSON");
  }

  const charge = event.data?.object as PingppCharge | undefined;
  if (!charge || typeof charge !== "object" || !charge.order_no) {
    throw new PingppWebhookError("Webhook 缺少 charge 对象");
  }

  return {
    eventId:
      typeof event.id === "string" && event.id
        ? event.id
        : `pingpp:${charge.id ?? charge.order_no}`,
    type: typeof event.type === "string" ? event.type : "",
    charge,
    raw: event,
  };
}
