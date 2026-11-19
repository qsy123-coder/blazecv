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
 * 蓝兔支付（LTZF）微信 Native 适配器。
 *
 * 签名：非空参数按 ASCII 升序拼 `a=1&b=2`，末尾追加 `&key=密钥`，md5 后转大写
 * （与微信支付 V2 一致）。
 * 下单：POST {base}/api/wxpay/native -> data.code_url
 * 查单：POST {base}/api/wxpay/get_pay_order -> data.pay_status = 1
 * 回调：POST 表单，code=0 为成功，应答体必须是大写 `SUCCESS`。
 */

export class LtzfConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`蓝兔支付配置不完整：${missing.join(", ")}`);
    this.name = "LtzfConfigError";
    this.missing = missing;
  }
}

export class LtzfApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`蓝兔支付接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "LtzfApiError";
    this.status = status;
    this.code = code;
  }
}

export class LtzfNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LtzfNotifyError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL");
  return explicit ? explicit.replace(/\/$/, "") : "";
}

export function ltzfNotifyUrl(): string {
  return (
    env("LTZF_NOTIFY_URL") ||
    (siteUrl() ? `${siteUrl()}/api/pay/notify/ltzf` : "")
  );
}

export function ltzfMissingConfig(): string[] {
  const missing: string[] = [];
  for (const name of ["LTZF_MCH_ID", "LTZF_KEY"]) {
    if (!env(name)) missing.push(name);
  }
  if (!ltzfNotifyUrl()) missing.push("LTZF_NOTIFY_URL|NEXT_PUBLIC_SITE_URL");
  return missing;
}

interface LtzfConfig {
  base: string;
  mchId: string;
  key: string;
}

function loadConfig(): LtzfConfig {
  const missing = ltzfMissingConfig();
  if (missing.length > 0) throw new LtzfConfigError(missing);
  return {
    base: (env("LTZF_API_BASE") || "https://api.ltzf.cn").replace(/\/+$/, ""),
    mchId: env("LTZF_MCH_ID"),
    key: env("LTZF_KEY"),
  };
}

function md5Upper(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex").toUpperCase();
}

export function ltzfSign(
  params: Record<string, string | number | null | undefined>,
  key: string,
): string {
  const base = Object.entries(params)
    .filter(
      ([name, value]) =>
        name !== "sign" &&
        value !== undefined &&
        value !== null &&
        String(value) !== "",
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5Upper(`${base}&key=${key}`);
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

interface LtzfResponse {
  code?: number | string;
  msg?: string;
  data?: {
    code_url?: string;
    QRcode_url?: string;
    out_trade_no?: string;
    pay_no?: string;
    pay_status?: number | string;
    total_fee?: string;
  };
  request_id?: string;
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<LtzfResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new LtzfApiError(response.status, "HTTP_ERROR");
  try {
    return (text ? JSON.parse(text) : {}) as LtzfResponse;
  } catch {
    throw new LtzfApiError(response.status, "INVALID_RESPONSE");
  }
}

export class LtzfProvider implements PayProvider {
  readonly id = "ltzf" as const;

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      mch_id: config.mchId,
      out_trade_no: input.outTradeNo,
      total_fee: fenToYuan(input.amountFen),
      body: input.description.slice(0, 64),
      timestamp: String(Math.floor(Date.now() / 1000)),
      notify_url: ltzfNotifyUrl(),
    };
    params.sign = ltzfSign(params, config.key);

    const data = await postForm(`${config.base}/api/wxpay/native`, params);
    if (Number(data.code) !== 0) {
      throw new LtzfApiError(502, data.msg || "CREATE_FAILED");
    }
    const codeUrl = data.data?.code_url || data.data?.QRcode_url;
    if (!codeUrl) throw new LtzfApiError(502, "MISSING_CODE_URL");
    return { codeUrl };
  }

  async queryOrder(outTradeNo: string): Promise<OrderQueryResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      mch_id: config.mchId,
      out_trade_no: outTradeNo,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    params.sign = ltzfSign(params, config.key);

    const data = await postForm(
      `${config.base}/api/wxpay/get_pay_order`,
      params,
    );
    if (Number(data.code) !== 0 || !data.data) return { state: "unknown" };
    if (data.data.out_trade_no && data.data.out_trade_no !== outTradeNo) {
      return { state: "unknown" };
    }
    const amountFen = yuanToFen(data.data.total_fee);
    if (Number(data.data.pay_status) === 1) {
      return {
        state: "paid",
        providerTradeNo: data.data.pay_no || undefined,
        amountFen: amountFen ?? undefined,
      };
    }
    return { state: "pending", amountFen: amountFen ?? undefined };
  }

  async closeOrder(): Promise<void> {
    // 蓝兔没有关闭订单接口，订单按本地 TTL 过期。
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new LtzfApiError(501, "REFUND_UNSUPPORTED");
  }
}

export interface LtzfNotifyResult {
  outTradeNo: string;
  providerTradeNo: string;
  amountFen: number;
  success: boolean;
  eventId: string;
  raw: Record<string, string>;
}

function notifyRecord(raw: string, contentType: string): Record<string, string> {
  const record: Record<string, string> = {};
  const text = raw.trim();
  if (!text) throw new LtzfNotifyError("回调报文为空");

  if (contentType.includes("json") || text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LtzfNotifyError("回调报文不是合法 JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new LtzfNotifyError("回调报文格式错误");
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

export function parseLtzfNotify(
  raw: string,
  contentType: string,
): LtzfNotifyResult {
  const config = loadConfig();
  const record = notifyRecord(raw, contentType);

  const sign = (record.sign ?? "").toUpperCase();
  if (!sign) throw new LtzfNotifyError("缺少 sign");
  if (sign !== ltzfSign(record, config.key)) {
    throw new LtzfNotifyError("回调验签失败");
  }
  if (record.mch_id && record.mch_id !== config.mchId) {
    throw new LtzfNotifyError("回调商户号不匹配");
  }

  const outTradeNo = (record.out_trade_no ?? "").trim();
  if (!outTradeNo) throw new LtzfNotifyError("回调缺少 out_trade_no");
  const amountFen = yuanToFen(record.total_fee);
  if (amountFen === null) throw new LtzfNotifyError("回调金额非法");

  const providerTradeNo = (record.pay_no ?? "").trim();
  const success = Number(record.code) === 0;
  return {
    outTradeNo,
    providerTradeNo,
    amountFen,
    success,
    eventId: `ltzf:${providerTradeNo || record.order_no || outTradeNo}:${success ? "success" : "fail"}`,
    raw: record,
  };
}
