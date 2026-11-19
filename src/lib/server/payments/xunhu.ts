import { createHash, randomBytes } from "node:crypto";
import type {
  NativeOrderInput,
  NativeOrderResult,
  OrderQueryResult,
  PayProvider,
  RefundInput,
  RefundResult,
} from "./provider";

/**
 * 虎皮椒（XunhuPay）适配器。
 *
 * 签名：参数名升序拼 `a=1&b=2`（跳过 hash 与空值），末尾直接拼接 appsecret，md5 小写。
 * 下单：POST {base}/payment/do.html -> url / url_qrcode
 * 查单：POST {base}/payment/query.html -> data.status = OD 已支付
 * 回调：POST 表单，status=OD 为支付成功，成功体返回 `success`。
 */

export class XunhuConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`虎皮椒配置不完整：${missing.join(", ")}`);
    this.name = "XunhuConfigError";
    this.missing = missing;
  }
}

export class XunhuApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`虎皮椒接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "XunhuApiError";
    this.status = status;
    this.code = code;
  }
}

export class XunhuNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XunhuNotifyError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL");
  return explicit ? explicit.replace(/\/$/, "") : "";
}

export function xunhuNotifyUrl(): string {
  return (
    env("XUNHU_NOTIFY_URL") ||
    (siteUrl() ? `${siteUrl()}/api/pay/notify/xunhu` : "")
  );
}

export function xunhuReturnUrl(): string {
  return env("XUNHU_RETURN_URL") || (siteUrl() ? `${siteUrl()}/membership` : "");
}

export function xunhuMissingConfig(): string[] {
  const missing: string[] = [];
  for (const name of ["XUNHU_APPID", "XUNHU_APPSECRET"]) {
    if (!env(name)) missing.push(name);
  }
  if (!xunhuNotifyUrl()) missing.push("XUNHU_NOTIFY_URL|NEXT_PUBLIC_SITE_URL");
  return missing;
}

interface XunhuConfig {
  base: string;
  appid: string;
  secret: string;
  wechatType: string;
  alipayType: string;
  wapUrl: string;
  wapName: string;
}

function loadConfig(): XunhuConfig {
  const missing = xunhuMissingConfig();
  if (missing.length > 0) throw new XunhuConfigError(missing);
  return {
    base: (env("XUNHU_API_BASE") || "https://api.xunhupay.com").replace(/\/+$/, ""),
    appid: env("XUNHU_APPID"),
    secret: env("XUNHU_APPSECRET"),
    wechatType: env("XUNHU_WECHAT_TYPE") || "WAP",
    alipayType: env("XUNHU_ALIPAY_TYPE") || "WAP",
    wapUrl: env("XUNHU_WAP_URL") || siteUrl() || "https://aetouban.cn",
    wapName: env("XUNHU_WAP_NAME") || "BlazeCV",
  };
}

function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

export function xunhuSign(
  params: Record<string, string | number | null | undefined>,
  secret: string,
): string {
  const base = Object.entries(params)
    .filter(
      ([name, value]) =>
        name !== "hash" &&
        value !== undefined &&
        value !== null &&
        String(value) !== "",
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5(`${base}${secret}`);
}

function nonce(): string {
  return randomBytes(16).toString("hex").slice(0, 32);
}

function fenToYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

function yuanToFen(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const fen = Math.round(Number(text) * 100);
  return Number.isFinite(fen) && fen > 0 ? fen : null;
}

interface XunhuResponse {
  errcode?: number | string;
  errmsg?: string;
  hash?: string;
  url?: string;
  url_qrcode?: string;
  data?: {
    status?: string;
    total_fee?: string;
    transaction_id?: string;
    out_trade_order?: string;
  };
  status?: string;
  total_fee?: string;
  transaction_id?: string;
  out_trade_order?: string;
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<XunhuResponse> {
  // 官方最新示例使用 JSON 提交；支付类型由 APPID 绑定的渠道决定。
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new XunhuApiError(response.status, "HTTP_ERROR");
  try {
    return (text ? JSON.parse(text) : {}) as XunhuResponse;
  } catch {
    throw new XunhuApiError(response.status, "INVALID_RESPONSE");
  }
}

function verifyResponseHash(
  data: XunhuResponse,
  secret: string,
): void {
  if (!data.hash) return;
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(data)) {
    if (typeof value === "string" || typeof value === "number") {
      flat[name] = String(value);
    }
  }
  if (data.hash.toLowerCase() !== xunhuSign(flat, secret)) {
    throw new XunhuApiError(502, "RESPONSE_SIGN_INVALID");
  }
}

export class XunhuProvider implements PayProvider {
  readonly id = "xunhu" as const;

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      version: "1.1",
      appid: config.appid,
      trade_order_id: input.outTradeNo,
      total_fee: fenToYuan(input.amountFen),
      title: input.description.slice(0, 32),
      time: String(Math.floor(Date.now() / 1000)),
      notify_url: xunhuNotifyUrl(),
      nonce_str: nonce(),
    };
    const returnUrl = xunhuReturnUrl();
    if (returnUrl) params.return_url = returnUrl;
    params.hash = xunhuSign(params, config.secret);

    const data = await postForm(`${config.base}/payment/do.html`, params);
    if (Number(data.errcode) !== 0) {
      throw new XunhuApiError(502, data.errmsg || "CREATE_FAILED");
    }
    verifyResponseHash(data, config.secret);

    // url 是支付页地址，url_qrcode 是二维码图片地址。默认用支付页作为
    // 二维码内容；把图片地址再编码成二维码会扫出图片而不是收银台。
    const field = env("XUNHU_QR_FIELD").toLowerCase();
    const codeUrl =
      field === "url_qrcode"
        ? data.url_qrcode
        : field === "url"
          ? data.url
          : data.url || data.url_qrcode;
    if (!codeUrl) throw new XunhuApiError(502, "MISSING_CODE_URL");
    return { codeUrl };
  }

  async queryOrder(outTradeNo: string): Promise<OrderQueryResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      appid: config.appid,
      out_trade_order: outTradeNo,
      time: String(Math.floor(Date.now() / 1000)),
      nonce_str: nonce(),
    };
    params.hash = xunhuSign(params, config.secret);

    const data = await postForm(`${config.base}/payment/query.html`, params);
    if (Number(data.errcode) !== 0) return { state: "unknown" };
    verifyResponseHash(data, config.secret);

    const payload = data.data ?? data;
    if (payload.out_trade_order && payload.out_trade_order !== outTradeNo) {
      return { state: "unknown" };
    }
    const amountFen = yuanToFen(payload.total_fee);
    if ((payload.status ?? "").toUpperCase() === "OD") {
      return {
        state: "paid",
        providerTradeNo: payload.transaction_id || undefined,
        amountFen: amountFen ?? undefined,
      };
    }
    return { state: "pending", amountFen: amountFen ?? undefined };
  }

  async closeOrder(): Promise<void> {
    // 虎皮椒没有关闭订单接口。
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new XunhuApiError(501, "REFUND_UNSUPPORTED");
  }
}

export interface XunhuNotifyResult {
  outTradeNo: string;
  providerTradeNo: string;
  amountFen: number;
  status: string;
  eventId: string;
  raw: Record<string, string>;
}

function notifyRecord(raw: string, contentType: string): Record<string, string> {
  const record: Record<string, string> = {};
  const text = raw.trim();
  if (!text) throw new XunhuNotifyError("回调报文为空");

  if (contentType.includes("json") || text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new XunhuNotifyError("回调报文不是合法 JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new XunhuNotifyError("回调报文格式错误");
    }
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      record[name] = typeof value === "string" ? value : String(value);
    }
    return record;
  }

  new URLSearchParams(text).forEach((value, name) => {
    record[name] = value;
  });
  return record;
}

export function parseXunhuNotify(
  raw: string,
  contentType: string,
): XunhuNotifyResult {
  const config = loadConfig();
  const record = notifyRecord(raw, contentType);

  const hash = (record.hash ?? "").toLowerCase();
  if (!hash) throw new XunhuNotifyError("缺少 hash");
  if (hash !== xunhuSign(record, config.secret)) {
    throw new XunhuNotifyError("回调验签失败");
  }
  if (record.appid && record.appid !== config.appid) {
    throw new XunhuNotifyError("回调 APPID 不匹配");
  }

  const outTradeNo = (record.trade_order_id ?? "").trim();
  if (!outTradeNo) throw new XunhuNotifyError("回调缺少 trade_order_id");
  const amountFen = yuanToFen(record.total_fee);
  if (amountFen === null) throw new XunhuNotifyError("回调金额非法");

  const status = (record.status ?? "").toUpperCase();
  const providerTradeNo = (record.transaction_id ?? "").trim();
  return {
    outTradeNo,
    providerTradeNo,
    amountFen,
    status,
    eventId: `xunhu:${providerTradeNo || outTradeNo}:${status}`,
    raw: record,
  };
}
