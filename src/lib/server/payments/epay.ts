import { createHash } from "node:crypto";
import type {
  NativeOrderInput,
  NativeOrderResult,
  OrderQueryResult,
  PayProvider,
  RefundInput,
  RefundResult,
} from "./provider";

/**
 * 易支付（彩虹易支付）协议适配器。
 *
 * 下单：POST {gateway}/mapi.php，返回 payurl / qrcode / urlscheme。
 * 查单：GET  {gateway}/api.php?act=order&pid=&key=&out_trade_no=
 * 退款：POST {gateway}/api.php?act=refund
 * 回调：GET/POST 表单参数，签名 md5(按 key 升序拼接 + KEY)，成功体必须是 `success`。
 */

export class EpayConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`易支付配置不完整：${missing.join(", ")}`);
    this.name = "EpayConfigError";
    this.missing = missing;
  }
}

export class EpayApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`易支付接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "EpayApiError";
    this.status = status;
    this.code = code;
  }
}

export class EpayNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EpayNotifyError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL");
  return explicit ? explicit.replace(/\/$/, "") : "";
}

export function epayNotifyUrl(): string {
  return (
    env("EPAY_NOTIFY_URL") ||
    (siteUrl() ? `${siteUrl()}/api/pay/notify/epay` : "")
  );
}

export function epayReturnUrl(): string {
  return env("EPAY_RETURN_URL") || (siteUrl() ? `${siteUrl()}/membership` : "");
}

export function epayMissingConfig(): string[] {
  const missing: string[] = [];
  for (const name of ["EPAY_GATEWAY", "EPAY_PID", "EPAY_KEY"]) {
    if (!env(name)) missing.push(name);
  }
  if (!epayNotifyUrl()) missing.push("EPAY_NOTIFY_URL|NEXT_PUBLIC_SITE_URL");
  return missing;
}

interface EpayConfig {
  gateway: string;
  pid: string;
  key: string;
  wechatType: string;
  alipayType: string;
  siteName: string;
}

function loadConfig(): EpayConfig {
  const missing = epayMissingConfig();
  if (missing.length > 0) throw new EpayConfigError(missing);
  return {
    gateway: env("EPAY_GATEWAY").replace(/\/+$/, ""),
    pid: env("EPAY_PID"),
    key: env("EPAY_KEY"),
    wechatType: env("EPAY_WECHAT_TYPE") || "wxpay",
    alipayType: env("EPAY_ALIPAY_TYPE") || "alipay",
    siteName: env("EPAY_SITE_NAME") || "BlazeCV",
  };
}

function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

/**
 * 易支付签名：过滤 sign / sign_type / 空值，按参数名 ASCII 升序拼成
 * `a=1&b=2`，末尾直接拼接商户密钥后取 md5 小写。
 */
export function epaySign(
  params: Record<string, string | number | null | undefined>,
  key: string,
): string {
  const base = Object.entries(params)
    .filter(
      ([name, value]) =>
        name !== "sign" &&
        name !== "sign_type" &&
        value !== undefined &&
        value !== null &&
        String(value) !== "",
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5(`${base}${key}`);
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

interface EpayResponse {
  code?: number | string;
  msg?: string;
  trade_no?: string;
  payurl?: string;
  qrcode?: string;
  urlscheme?: string;
  sign?: string;
  data?: {
    status?: number | string;
    money?: string;
    trade_no?: string;
    out_trade_no?: string;
  };
}

async function requestJson(
  url: string,
  init: RequestInit,
): Promise<EpayResponse> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new EpayApiError(response.status, "HTTP_ERROR");
  try {
    return (text ? JSON.parse(text) : {}) as EpayResponse;
  } catch {
    // 部分网关在 mapi.php 不可用时返回 HTML 支付页，此时无法取二维码。
    throw new EpayApiError(response.status, "INVALID_RESPONSE");
  }
}

export class EpayProvider implements PayProvider {
  readonly id = "epay" as const;

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      pid: config.pid,
      type: input.channel === "alipay" ? config.alipayType : config.wechatType,
      out_trade_no: input.outTradeNo,
      notify_url: epayNotifyUrl(),
      name: input.description.slice(0, 64),
      money: fenToYuan(input.amountFen),
      clientip: input.clientIp || "127.0.0.1",
      device: "pc",
      sitename: config.siteName,
    };
    const returnUrl = epayReturnUrl();
    if (returnUrl) params.return_url = returnUrl;

    const body = new URLSearchParams(params);
    body.set("sign", epaySign(params, config.key));
    body.set("sign_type", "MD5");

    const data = await requestJson(`${config.gateway}/mapi.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (Number(data.code) !== 1) {
      throw new EpayApiError(502, data.msg || "CREATE_FAILED");
    }
    if (data.sign) {
      const flat: Record<string, string> = {};
      for (const [name, value] of Object.entries(data)) {
        if (typeof value === "string" || typeof value === "number") {
          flat[name] = String(value);
        }
      }
      if (data.sign.toLowerCase() !== epaySign(flat, config.key)) {
        throw new EpayApiError(502, "RESPONSE_SIGN_INVALID");
      }
    }

    // 不同易支付源码对 qrcode 的定义不一致：有的是微信原生串，有的是图片
    // 地址或收银台链接。EPAY_QR_FIELD 可强制指定字段。
    const field = env("EPAY_QR_FIELD").toLowerCase();
    const candidates =
      field === "qrcode"
        ? [data.qrcode]
        : field === "payurl"
          ? [data.payurl]
          : field === "urlscheme"
            ? [data.urlscheme]
            : [data.qrcode, data.payurl, data.urlscheme];
    const codeUrl = candidates.find((value) => Boolean(value));
    if (!codeUrl) throw new EpayApiError(502, "MISSING_CODE_URL");
    return { codeUrl, providerTradeNo: data.trade_no || undefined };
  }

  async queryOrder(
    outTradeNo: string,
  ): Promise<OrderQueryResult> {
    const config = loadConfig();
    const query = new URLSearchParams({
      act: "order",
      pid: config.pid,
      key: config.key,
      out_trade_no: outTradeNo,
    });
    const data = await requestJson(`${config.gateway}/api.php?${query}`, {
      method: "GET",
    });
    if (Number(data.code) !== 1 || !data.data) return { state: "unknown" };
    if (data.data.out_trade_no && data.data.out_trade_no !== outTradeNo) {
      return { state: "unknown" };
    }
    const amountFen = yuanToFen(data.data.money);
    if (Number(data.data.status) === 1) {
      return {
        state: "paid",
        providerTradeNo: data.data.trade_no || undefined,
        amountFen: amountFen ?? undefined,
      };
    }
    return { state: "pending", amountFen: amountFen ?? undefined };
  }

  async closeOrder(): Promise<void> {
    // 易支付没有关闭订单接口，订单按 TTL 自然过期。
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const config = loadConfig();
    const query = new URLSearchParams({
      act: "refund",
      pid: config.pid,
      key: config.key,
      out_trade_no: input.outTradeNo,
      money: fenToYuan(input.refundFen),
    });
    const data = await requestJson(`${config.gateway}/api.php?${query}`, {
      method: "POST",
    });
    if (Number(data.code) !== 1) {
      throw new EpayApiError(502, data.msg || "REFUND_FAILED");
    }
    return { refundId: input.outRefundNo, state: "SUCCESS" };
  }
}

export interface EpayNotifyResult {
  outTradeNo: string;
  providerTradeNo: string;
  amountFen: number;
  tradeStatus: string;
  eventId: string;
  raw: Record<string, string>;
}

export function parseEpayNotify(params: URLSearchParams): EpayNotifyResult {
  const config = loadConfig();
  const raw: Record<string, string> = {};
  params.forEach((value, name) => {
    raw[name] = value;
  });

  const sign = (raw.sign ?? "").toLowerCase();
  if (!sign) throw new EpayNotifyError("缺少 sign");
  if (sign !== epaySign(raw, config.key)) {
    throw new EpayNotifyError("回调验签失败");
  }

  if (raw.pid && raw.pid !== config.pid) {
    throw new EpayNotifyError("回调商户号不匹配");
  }

  const outTradeNo = (raw.out_trade_no ?? "").trim();
  if (!outTradeNo) throw new EpayNotifyError("回调缺少 out_trade_no");

  const amountFen = yuanToFen(raw.money);
  if (amountFen === null) throw new EpayNotifyError("回调金额非法");

  const tradeStatus = (raw.trade_status ?? "").trim();
  const providerTradeNo = (raw.trade_no ?? "").trim();
  return {
    outTradeNo,
    providerTradeNo,
    amountFen,
    tradeStatus,
    eventId: `epay:${providerTradeNo || outTradeNo}:${tradeStatus}`,
    raw,
  };
}
