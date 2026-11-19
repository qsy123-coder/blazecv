import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
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

const API_BASE = (process.env.WECHAT_PAY_API_BASE ?? "https://api.mch.weixin.qq.com").replace(
  /\/$/,
  "",
);

export type WechatPayMode = "direct" | "partner";

export class WechatConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`微信支付配置不完整：${missing.join(", ")}`);
    this.name = "WechatConfigError";
    this.missing = missing;
  }
}

export class WechatApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`微信支付接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "WechatApiError";
    this.status = status;
    this.code = code;
  }
}

export class WechatNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatNotifyError";
  }
}

interface WechatConfig {
  mode: WechatPayMode;
  /** 直连模式为商户 AppID；服务商模式为 sp_appid。 */
  appid: string;
  /** 直连模式为 mchid；服务商模式为 sp_mchid。 */
  mchid: string;
  /** 服务商模式下的特约商户号；直连模式为空。 */
  subMchid: string | null;
  /** 服务商模式下可选的子商户 AppID。 */
  subAppid: string | null;
  apiV3Key: string;
  serialNo: string;
  notifyUrl: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** 微信支付公钥模式时非空；平台证书模式为空。 */
  publicKeyId: string | null;
}

export function wechatPayMode(): WechatPayMode {
  return env("WECHAT_PAY_MODE") === "partner" ? "partner" : "direct";
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function readPem(pathName: string, base64Name: string): string | null {
  const file = pathName ? env(pathName) : "";
  if (file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }
  const base64 = base64Name ? env(base64Name) : "";
  if (base64) {
    try {
      return Buffer.from(base64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
}

/** 缺失的配置项名称（只返回名称，不返回值）。 */
export function wechatMissingConfig(): string[] {
  const missing: string[] = [];
  const mode = wechatPayMode();
  const required =
    mode === "partner"
      ? ["WECHAT_PAY_SP_APPID", "WECHAT_PAY_SP_MCHID", "WECHAT_PAY_SUB_MCHID"]
      : ["WECHAT_PAY_APPID", "WECHAT_PAY_MCHID"];
  for (const name of [
    ...required,
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_MCH_SERIAL_NO",
    "WECHAT_PAY_NOTIFY_URL",
  ]) {
    if (!env(name)) missing.push(name);
  }
  if (!readPem("WECHAT_PAY_MCH_PRIVATE_KEY_PATH", "WECHAT_PAY_MCH_PRIVATE_KEY_BASE64")) {
    missing.push("WECHAT_PAY_MCH_PRIVATE_KEY_PATH|WECHAT_PAY_MCH_PRIVATE_KEY_BASE64");
  }
  const publicPem =
    readPem("WECHAT_PAY_PUBLIC_KEY_PATH", "WECHAT_PAY_PUBLIC_KEY_BASE64") ??
    readPem("WECHAT_PAY_PLATFORM_CERT_PATH", "");
  if (!publicPem) {
    missing.push("WECHAT_PAY_PUBLIC_KEY_PATH|WECHAT_PAY_PUBLIC_KEY_BASE64");
  }
  return missing;
}

let cachedConfig: WechatConfig | null = null;

function loadConfig(): WechatConfig {
  if (cachedConfig) return cachedConfig;

  const missing = wechatMissingConfig();
  if (missing.length > 0) throw new WechatConfigError(missing);

  const privatePem = readPem(
    "WECHAT_PAY_MCH_PRIVATE_KEY_PATH",
    "WECHAT_PAY_MCH_PRIVATE_KEY_BASE64",
  );
  const publicPem =
    readPem("WECHAT_PAY_PUBLIC_KEY_PATH", "WECHAT_PAY_PUBLIC_KEY_BASE64") ??
    readPem("WECHAT_PAY_PLATFORM_CERT_PATH", "");
  if (!privatePem || !publicPem) throw new WechatConfigError(missing);

  const mode = wechatPayMode();
  try {
    cachedConfig = {
      mode,
      appid: mode === "partner" ? env("WECHAT_PAY_SP_APPID") : env("WECHAT_PAY_APPID"),
      mchid: mode === "partner" ? env("WECHAT_PAY_SP_MCHID") : env("WECHAT_PAY_MCHID"),
      subMchid: mode === "partner" ? env("WECHAT_PAY_SUB_MCHID") : null,
      subAppid:
        mode === "partner" ? env("WECHAT_PAY_SUB_APPID") || null : null,
      apiV3Key: env("WECHAT_PAY_API_V3_KEY"),
      serialNo: env("WECHAT_PAY_MCH_SERIAL_NO"),
      notifyUrl: env("WECHAT_PAY_NOTIFY_URL"),
      privateKey: createPrivateKey({ key: privatePem, format: "pem" }),
      publicKey: createPublicKey(publicPem),
      publicKeyId: env("WECHAT_PAY_PUBLIC_KEY_ID") || null,
    };
  } catch {
    throw new WechatConfigError(["WECHAT_PAY_*_KEY（PEM 解析失败）"]);
  }
  return cachedConfig;
}

function signMessage(message: string, config: WechatConfig): string {
  return sign("RSA-SHA256", Buffer.from(message, "utf8"), config.privateKey).toString(
    "base64",
  );
}

function verifyMessage(
  message: string,
  signature: string,
  config: WechatConfig,
): boolean {
  try {
    return verify(
      "RSA-SHA256",
      Buffer.from(message, "utf8"),
      config.publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

function checkFreshness(timestamp: string): void {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
    throw new WechatNotifyError("签名时间戳无效或已过期");
  }
}

function verifyResponseSignature(headers: Headers, bodyText: string): void {
  const timestamp = headers.get("wechatpay-timestamp");
  const nonce = headers.get("wechatpay-nonce");
  const signature = headers.get("wechatpay-signature");
  // WeChat always signs successful v3 responses. Some local proxies strip
  // headers; TLS still authenticates the peer, so only verify when present.
  if (!timestamp || !nonce || !signature) return;

  const config = loadConfig();
  checkFreshness(timestamp);
  const message = `${timestamp}\n${nonce}\n${bodyText}\n`;
  if (!verifyMessage(message, signature, config)) {
    throw new WechatApiError(502, "RESPONSE_SIGNATURE_INVALID");
  }
}

function authorization(
  method: string,
  pathWithQuery: string,
  bodyText: string,
  config: WechatConfig,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${bodyText}\n`;
  const signature = signMessage(message, config);
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",` +
    `nonce_str="${nonce}",signature="${signature}",` +
    `timestamp="${timestamp}",serial_no="${config.serialNo}"`
  );
}

async function apiRequest<T>(
  method: "GET" | "POST",
  pathWithQuery: string,
  body?: unknown,
): Promise<T> {
  const config = loadConfig();
  const bodyText = body === undefined ? "" : JSON.stringify(body);

  const response = await fetch(`${API_BASE}${pathWithQuery}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization(method, pathWithQuery, bodyText, config),
    },
    body: method === "GET" ? undefined : bodyText,
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  verifyResponseSignature(response.headers, text);

  if (!response.ok) {
    let code = "";
    try {
      code = String((JSON.parse(text) as { code?: unknown }).code ?? "");
    } catch {
      /* non-JSON error body */
    }
    throw new WechatApiError(response.status, code);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function rfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

interface NotifyResource {
  ciphertext?: unknown;
  nonce?: unknown;
  associated_data?: unknown;
}

function decryptResource(resource: NotifyResource, apiV3Key: string): unknown {
  const ciphertext = typeof resource.ciphertext === "string" ? resource.ciphertext : "";
  const nonce = typeof resource.nonce === "string" ? resource.nonce : "";
  const associatedData =
    typeof resource.associated_data === "string" ? resource.associated_data : "";
  if (!ciphertext || !nonce) {
    throw new WechatNotifyError("回调 resource 缺少 ciphertext/nonce");
  }

  const buffer = Buffer.from(ciphertext, "base64");
  if (buffer.length <= 16) throw new WechatNotifyError("回调密文长度异常");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(nonce, "utf8"),
  );
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(buffer.subarray(buffer.length - 16));

  try {
    const plain = Buffer.concat([
      decipher.update(buffer.subarray(0, buffer.length - 16)),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plain);
  } catch {
    throw new WechatNotifyError("回调密文解密失败");
  }
}

export interface WechatNotifyResult {
  notificationId: string;
  eventType: string;
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountFen: number;
  mchid: string;
  appid: string;
  raw: unknown;
}

/** 验证微信回调签名并解密 resource；任何失败都抛出 WechatNotifyError。 */
export async function parseWechatNotify(
  rawBody: string,
  headers: Headers,
): Promise<WechatNotifyResult> {
  const config = loadConfig();
  const timestamp = headers.get("wechatpay-timestamp") ?? "";
  const nonce = headers.get("wechatpay-nonce") ?? "";
  const signature = headers.get("wechatpay-signature") ?? "";
  const serial = headers.get("wechatpay-serial") ?? "";

  if (!timestamp || !nonce || !signature) {
    throw new WechatNotifyError("缺少 Wechatpay 签名头");
  }
  checkFreshness(timestamp);

  if (config.publicKeyId && serial && serial !== config.publicKeyId) {
    throw new WechatNotifyError("回调公钥 ID 不匹配");
  }

  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  if (!verifyMessage(message, signature, config)) {
    throw new WechatNotifyError("回调验签失败");
  }

  let envelope: {
    id?: unknown;
    event_type?: unknown;
    resource?: NotifyResource;
  };
  try {
    envelope = JSON.parse(rawBody) as typeof envelope;
  } catch {
    throw new WechatNotifyError("回调报文不是合法 JSON");
  }

  if (!envelope.resource) throw new WechatNotifyError("回调缺少 resource");
  const resource = decryptResource(envelope.resource, config.apiV3Key) as {
    out_trade_no?: unknown;
    transaction_id?: unknown;
    trade_state?: unknown;
    amount?: { total?: unknown };
    mchid?: unknown;
    appid?: unknown;
    sp_mchid?: unknown;
    sp_appid?: unknown;
    sub_mchid?: unknown;
    sub_appid?: unknown;
  };

  const outTradeNo =
    typeof resource.out_trade_no === "string" ? resource.out_trade_no : "";
  const amountFen = Number(resource.amount?.total);
  if (!outTradeNo || !Number.isFinite(amountFen)) {
    throw new WechatNotifyError("回调缺少订单号或金额");
  }

  if (config.mode === "partner") {
    // 服务商模式回调用 sp_mchid / sub_mchid / sp_appid / sub_appid。
    if (!resource.sp_mchid || String(resource.sp_mchid) !== config.mchid) {
      throw new WechatNotifyError("回调服务商商户号不匹配");
    }
    if (config.subMchid && String(resource.sub_mchid ?? "") !== config.subMchid) {
      throw new WechatNotifyError("回调特约商户号不匹配");
    }
    if (resource.sp_appid && String(resource.sp_appid) !== config.appid) {
      throw new WechatNotifyError("回调服务商 AppID 不匹配");
    }
    if (
      config.subAppid &&
      resource.sub_appid &&
      String(resource.sub_appid) !== config.subAppid
    ) {
      throw new WechatNotifyError("回调子商户 AppID 不匹配");
    }
  } else {
    if (resource.mchid && String(resource.mchid) !== config.mchid) {
      throw new WechatNotifyError("回调商户号不匹配");
    }
    if (resource.appid && String(resource.appid) !== config.appid) {
      throw new WechatNotifyError("回调 AppID 不匹配");
    }
  }

  const mchidValue =
    config.mode === "partner"
      ? typeof resource.sp_mchid === "string"
        ? resource.sp_mchid
        : config.mchid
      : typeof resource.mchid === "string"
        ? resource.mchid
        : config.mchid;
  const appidValue =
    config.mode === "partner"
      ? typeof resource.sp_appid === "string"
        ? resource.sp_appid
        : config.appid
      : typeof resource.appid === "string"
        ? resource.appid
        : config.appid;

  return {
    notificationId:
      typeof envelope.id === "string" && envelope.id
        ? envelope.id
        : `wechat:${outTradeNo}`,
    eventType:
      typeof envelope.event_type === "string" ? envelope.event_type : "TRANSACTION.SUCCESS",
    outTradeNo,
    transactionId:
      typeof resource.transaction_id === "string" ? resource.transaction_id : "",
    tradeState:
      typeof resource.trade_state === "string" ? resource.trade_state : "",
    amountFen,
    mchid: mchidValue,
    appid: appidValue,
    raw: resource,
  };
}

export class WechatPayProvider implements PayProvider {
  readonly id = "wechat" as const;

  subMerchantId(): string | null {
    return loadConfig().subMchid;
  }

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const common = {
      description: input.description,
      out_trade_no: input.outTradeNo,
      notify_url: config.notifyUrl,
      time_expire: rfc3339(input.expiresAt),
      amount: { total: input.amountFen, currency: "CNY" },
      ...(input.attach ? { attach: input.attach } : {}),
    };

    const path =
      config.mode === "partner"
        ? "/v3/pay/partner/transactions/native"
        : "/v3/pay/transactions/native";
    const payload =
      config.mode === "partner"
        ? {
            sp_appid: config.appid,
            sp_mchid: config.mchid,
            ...(config.subAppid ? { sub_appid: config.subAppid } : {}),
            sub_mchid: config.subMchid,
            ...common,
          }
        : {
            appid: config.appid,
            mchid: config.mchid,
            ...common,
          };

    const data = await apiRequest<{ code_url?: string }>("POST", path, payload);
    if (!data.code_url) throw new WechatApiError(502, "MISSING_CODE_URL");
    return { codeUrl: data.code_url };
  }

  async queryOrder(outTradeNo: string): Promise<OrderQueryResult> {
    const config = loadConfig();
    const encodedNo = encodeURIComponent(outTradeNo);
    const path =
      config.mode === "partner"
        ? `/v3/pay/partner/transactions/out-trade-no/${encodedNo}` +
          `?sp_mchid=${encodeURIComponent(config.mchid)}` +
          `&sub_mchid=${encodeURIComponent(config.subMchid ?? "")}`
        : `/v3/pay/transactions/out-trade-no/${encodedNo}` +
          `?mchid=${encodeURIComponent(config.mchid)}`;

    const data = await apiRequest<{
      trade_state?: string;
      transaction_id?: string;
      amount?: { total?: number };
    }>("GET", path);

    switch (data.trade_state) {
      case "SUCCESS":
        return {
          state: "paid",
          providerTradeNo: data.transaction_id,
          amountFen: data.amount?.total,
        };
      case "NOTPAY":
      case "USERPAYING":
        return { state: "pending" };
      case "CLOSED":
      case "REVOKED":
      case "PAYERROR":
      case "EXPIRED":
        return { state: "closed" };
      default:
        return { state: "unknown" };
    }
  }

  async closeOrder(outTradeNo: string): Promise<void> {
    const config = loadConfig();
    const encodedNo = encodeURIComponent(outTradeNo);
    const path =
      config.mode === "partner"
        ? `/v3/pay/partner/transactions/out-trade-no/${encodedNo}/close`
        : `/v3/pay/transactions/out-trade-no/${encodedNo}/close`;
    const body =
      config.mode === "partner"
        ? { sp_mchid: config.mchid, sub_mchid: config.subMchid }
        : { mchid: config.mchid };
    await apiRequest("POST", path, body);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const config = loadConfig();
    const data = await apiRequest<{ refund_id?: string; status?: string }>(
      "POST",
      "/v3/refund/domestic/refunds",
      {
        ...(config.mode === "partner" ? { sub_mchid: config.subMchid } : {}),
        out_trade_no: input.outTradeNo,
        out_refund_no: input.outRefundNo,
        reason: input.reason,
        amount: {
          refund: input.refundFen,
          total: input.totalFen,
          currency: "CNY",
        },
      },
    );
    return {
      refundId: data.refund_id ?? input.outRefundNo,
      state: data.status ?? "PROCESSING",
    };
  }
}
