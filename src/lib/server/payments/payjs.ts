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
 * PayJS Native 扫码适配器（个人/小微商户常用）。
 *
 * 签名：参数名升序拼 `a=1&b=2`，末尾追加 `&key=KEY`，md5 后转大写。
 * 下单：POST {base}/native  -> code_url / payjs_order_id
 * 查单：POST {base}/check
 * 退款：POST {base}/refund
 * 回调：POST 表单或 JSON，`return_code=1` 为支付成功，成功体返回 `success`。
 */

export class PayjsConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`PayJS 配置不完整：${missing.join(", ")}`);
    this.name = "PayjsConfigError";
    this.missing = missing;
  }
}

export class PayjsApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`PayJS 接口错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "PayjsApiError";
    this.status = status;
    this.code = code;
  }
}

export class PayjsNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayjsNotifyError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL");
  return explicit ? explicit.replace(/\/$/, "") : "";
}

export function payjsNotifyUrl(): string {
  return (
    env("PAYJS_NOTIFY_URL") ||
    (siteUrl() ? `${siteUrl()}/api/pay/notify/payjs` : "")
  );
}

export function payjsMissingConfig(): string[] {
  const missing: string[] = [];
  for (const name of ["PAYJS_MCHID", "PAYJS_KEY"]) {
    if (!env(name)) missing.push(name);
  }
  if (!payjsNotifyUrl()) missing.push("PAYJS_NOTIFY_URL|NEXT_PUBLIC_SITE_URL");
  return missing;
}

function loadConfig(): { base: string; mchid: string; key: string } {
  const missing = payjsMissingConfig();
  if (missing.length > 0) throw new PayjsConfigError(missing);
  return {
    base: (env("PAYJS_API_BASE") || "https://payjs.cn/api").replace(/\/+$/, ""),
    mchid: env("PAYJS_MCHID"),
    key: env("PAYJS_KEY"),
  };
}

function md5Upper(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex").toUpperCase();
}

export function payjsSign(
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

interface PayjsResponse {
  return_code?: number | string;
  return_msg?: string;
  code_url?: string;
  payjs_order_id?: string;
  qrcode?: string;
  transaction_id?: string;
  total_fee?: number | string;
  out_trade_no?: string;
  status?: number | string;
  sign?: string;
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<PayjsResponse> {
  const body = new URLSearchParams(params);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new PayjsApiError(response.status, "HTTP_ERROR");
  try {
    return (text ? JSON.parse(text) : {}) as PayjsResponse;
  } catch {
    throw new PayjsApiError(response.status, "INVALID_RESPONSE");
  }
}

export class PayjsProvider implements PayProvider {
  readonly id = "payjs" as const;

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const config = loadConfig();
    const params: Record<string, string> = {
      mchid: config.mchid,
      total_fee: String(input.amountFen),
      out_trade_no: input.outTradeNo,
      body: input.description.slice(0, 32),
      notify_url: payjsNotifyUrl(),
    };
    if (input.attach) params.attach = input.attach;
    params.sign = payjsSign(params, config.key);

    const data = await postForm(`${config.base}/native`, params);
    if (Number(data.return_code) !== 1) {
      throw new PayjsApiError(502, data.return_msg || "CREATE_FAILED");
    }
    if (data.sign) {
      const flat: Record<string, string> = {};
      for (const [name, value] of Object.entries(data)) {
        if (typeof value === "string" || typeof value === "number") {
          flat[name] = String(value);
        }
      }
      if (data.sign.toUpperCase() !== payjsSign(flat, config.key)) {
        throw new PayjsApiError(502, "RESPONSE_SIGN_INVALID");
      }
    }

    // code_url 是 weixin:// 协议串；qrcode 是 PayJS 托管的二维码图片地址，
    // 不能直接编码成二维码，二者都缺时明确失败。
    if (!data.code_url) throw new PayjsApiError(502, "MISSING_CODE_URL");
    return {
      codeUrl: data.code_url,
      providerTradeNo: data.payjs_order_id || undefined,
    };
  }

  async queryOrder(
    outTradeNo: string,
    providerTradeNo?: string | null,
  ): Promise<OrderQueryResult> {
    const config = loadConfig();
    const params: Record<string, string> = providerTradeNo
      ? { payjs_order_id: providerTradeNo }
      : { out_trade_no: outTradeNo };
    params.sign = payjsSign(params, config.key);

    const data = await postForm(`${config.base}/check`, params);
    if (Number(data.return_code) !== 1) return { state: "unknown" };
    if (data.out_trade_no && data.out_trade_no !== outTradeNo) {
      return { state: "unknown" };
    }
    const amountFen = Number(data.total_fee);
    if (Number(data.status) === 1) {
      return {
        state: "paid",
        providerTradeNo: data.payjs_order_id || undefined,
        amountFen: Number.isFinite(amountFen) && amountFen > 0 ? amountFen : undefined,
      };
    }
    return { state: "pending" };
  }

  async closeOrder(): Promise<void> {
    // PayJS 没有关闭订单接口。
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const config = loadConfig();
    if (!input.providerTradeNo) {
      throw new PayjsApiError(400, "MISSING_PAYJS_ORDER_ID");
    }
    const params: Record<string, string> = {
      payjs_order_id: input.providerTradeNo,
    };
    params.sign = payjsSign(params, config.key);
    const data = await postForm(`${config.base}/refund`, params);
    if (Number(data.return_code) !== 1) {
      throw new PayjsApiError(502, data.return_msg || "REFUND_FAILED");
    }
    return { refundId: input.outRefundNo, state: "SUCCESS" };
  }
}

export interface PayjsNotifyResult {
  outTradeNo: string;
  providerTradeNo: string;
  amountFen: number;
  eventId: string;
  raw: Record<string, string>;
}

function notifyRecord(raw: string, contentType: string): Record<string, string> {
  const record: Record<string, string> = {};
  const text = raw.trim();
  if (!text) throw new PayjsNotifyError("回调报文为空");

  if (contentType.includes("json") || text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PayjsNotifyError("回调报文不是合法 JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new PayjsNotifyError("回调报文格式错误");
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

export function parsePayjsNotify(
  raw: string,
  contentType: string,
): PayjsNotifyResult {
  const config = loadConfig();
  const record = notifyRecord(raw, contentType);

  const sign = (record.sign ?? "").toUpperCase();
  if (!sign) throw new PayjsNotifyError("缺少 sign");
  if (sign !== payjsSign(record, config.key)) {
    throw new PayjsNotifyError("回调验签失败");
  }
  if (record.mchid && record.mchid !== config.mchid) {
    throw new PayjsNotifyError("回调商户号不匹配");
  }

  const outTradeNo = (record.out_trade_no ?? "").trim();
  if (!outTradeNo) throw new PayjsNotifyError("回调缺少 out_trade_no");
  const amountFen = Number(record.total_fee);
  if (!Number.isInteger(amountFen) || amountFen <= 0) {
    throw new PayjsNotifyError("回调金额非法");
  }
  const providerTradeNo = (record.payjs_order_id ?? "").trim();
  const paid = Number(record.return_code) === 1;

  return {
    outTradeNo,
    providerTradeNo,
    amountFen,
    eventId: `payjs:${providerTradeNo || outTradeNo}:${record.transaction_id ?? ""}:${paid ? "paid" : "notify"}`,
    raw: record,
  };
}
