import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  NativeOrderInput,
  NativeOrderResult,
  OrderQueryResult,
  PayProvider,
  RefundInput,
  RefundResult,
} from "./provider";

/**
 * 个人收款码监听通知（免签）适配器。
 *
 * 买家扫描商户自己的微信 / 支付宝个人收款码；手机或 PC 上的收款监听程序
 * （如安卓通知转发、XPosed 钩子、Windows 微信收款助手监听）在到账后回调
 * `/api/pay/notify/qrnotify`，本服务按金额（或备注）匹配订单并开通会员。
 *
 * 匹配模式：
 * - amount（默认）：下单时在标价上加 0.01–0.49 元的唯一尾数，到账金额精确匹配；
 * - remark：金额不变，要求付款备注包含订单号后 6 位。
 */

export class QrNotifyConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`个人收款码通道配置不完整：${missing.join(", ")}`);
    this.name = "QrNotifyConfigError";
    this.missing = missing;
  }
}

export class QrNotifyApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`个人收款码通道错误 ${status}${code ? ` (${code})` : ""}`);
    this.name = "QrNotifyApiError";
    this.status = status;
    this.code = code;
  }
}

export class QrNotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrNotifyAuthError";
  }
}

export class QrNotifyPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrNotifyPayloadError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function qrNotifySecret(): string {
  return env("QR_NOTIFY_SECRET");
}

export function qrNotifyToken(): string {
  return env("QR_NOTIFY_TOKEN") || qrNotifySecret();
}

export function qrNotifyMatchMode(): "amount" | "remark" {
  return env("QR_NOTIFY_MATCH") === "remark" ? "remark" : "amount";
}

export function wechatQrContent(): string {
  return env("QR_NOTIFY_WECHAT_QR") || env("QR_NOTIFY_QR_CONTENT");
}

export function alipayQrContent(): string {
  return env("QR_NOTIFY_ALIPAY_QR");
}

export function wechatQrImage(): string {
  return env("QR_NOTIFY_WECHAT_QR_IMAGE");
}

export function alipayQrImage(): string {
  return env("QR_NOTIFY_ALIPAY_QR_IMAGE");
}

/**
 * 收款码展示内容：优先二维码字符串（前端生成二维码）；只有图片时返回
 * 同源图片地址，由 /api/pay/qr-image 读取环境变量指定的文件。
 */
export function qrNotifyChannelPayload(
  channel: "wechat" | "alipay",
): string | null {
  const content =
    channel === "alipay" ? alipayQrContent() : wechatQrContent();
  if (content) return content;
  const image = channel === "alipay" ? alipayQrImage() : wechatQrImage();
  return image ? `/api/pay/qr-image?channel=${channel}` : null;
}

export function qrNotifyMissingConfig(): string[] {
  const missing: string[] = [];
  if (!qrNotifySecret()) missing.push("QR_NOTIFY_SECRET");
  if (
    !wechatQrContent() &&
    !alipayQrContent() &&
    !wechatQrImage() &&
    !alipayQrImage()
  ) {
    missing.push(
      "QR_NOTIFY_WECHAT_QR|QR_NOTIFY_WECHAT_QR_IMAGE|QR_NOTIFY_QR_CONTENT",
    );
  }
  return missing;
}

function jitterCents(outTradeNo: string): number {
  const suffix = outTradeNo.slice(-4);
  const parsed = Number.parseInt(suffix, 36);
  return 1 + ((Number.isFinite(parsed) ? parsed : 0) % 49);
}

export class QrNotifyProvider implements PayProvider {
  readonly id = "qrnotify" as const;

  payableAmountFen(baseFen: number, outTradeNo: string): number {
    return qrNotifyMatchMode() === "remark"
      ? baseFen
      : baseFen + jitterCents(outTradeNo);
  }

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    const payload = qrNotifyChannelPayload(input.channel);
    if (!payload) throw new QrNotifyConfigError(qrNotifyMissingConfig());
    // 字符串形态（微信 wxp://、支付宝二维码串）由前端生成二维码；
    // 只有图片时返回 /api/pay/qr-image 同源地址，前端直接展示图片。
    return { codeUrl: payload };
  }

  async queryOrder(): Promise<OrderQueryResult> {
    // 免签通道没有查单接口，到账完全依赖监听程序回调。
    return { state: "unknown" };
  }

  async closeOrder(): Promise<void> {
    // 没有远端订单可关闭。
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new QrNotifyApiError(501, "REFUND_UNSUPPORTED");
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function qrNotifySignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`, "utf8")
    .digest("hex");
}

/** 校验监听程序请求：HMAC 头优先；也支持 `?token=` 给不能签名的监听 App。 */
export function verifyQrNotifyRequest(
  rawBody: string,
  headers: Headers,
  query: URLSearchParams,
): void {
  const secret = qrNotifySecret();
  if (!secret) throw new QrNotifyAuthError("通道密钥未配置");

  const signature =
    headers.get("x-qr-signature") ?? headers.get("X-QR-Signature") ?? "";
  if (signature) {
    const timestamp = headers.get("x-qr-timestamp") ?? "";
    const nonce = headers.get("x-qr-nonce") ?? "";
    if (!timestamp || !nonce) {
      throw new QrNotifyAuthError("缺少 x-qr-timestamp / x-qr-nonce");
    }
    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
      throw new QrNotifyAuthError("回调时间戳超出允许窗口");
    }
    const expected = qrNotifySignature(secret, timestamp, nonce, rawBody);
    if (!safeEqual(signature.toLowerCase(), expected)) {
      throw new QrNotifyAuthError("回调验签失败");
    }
    return;
  }

  const token = query.get("token") ?? headers.get("x-qr-token") ?? "";
  if (!token) throw new QrNotifyAuthError("缺少签名或 token");
  if (!safeEqual(token, qrNotifyToken()) && !safeEqual(token, secret)) {
    throw new QrNotifyAuthError("token 校验失败");
  }
}

export interface QrNotifyPayload {
  amountFen: number;
  tradeNo: string;
  outTradeNo?: string;
  remark?: string;
  paidAt?: string;
  raw: Record<string, string>;
}

function yuanToFen(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const fen = Math.round(Number(text) * 100);
  return Number.isFinite(fen) && fen > 0 ? fen : null;
}

function mergeRecord(
  rawBody: string,
  contentType: string,
  query: URLSearchParams,
): Record<string, string> {
  const record: Record<string, string> = {};
  const text = rawBody.trim();

  if (text) {
    if (contentType.includes("json") || text.startsWith("{")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new QrNotifyPayloadError("回调报文不是合法 JSON");
      }
      if (!parsed || typeof parsed !== "object") {
        throw new QrNotifyPayloadError("回调报文格式错误");
      }
      for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === null || value === undefined) continue;
        record[name] = typeof value === "string" ? value : String(value);
      }
    } else {
      new URLSearchParams(text).forEach((value, name) => {
        record[name] = value;
      });
    }
  }

  // GET 监听或查询串补充缺失字段；body 优先。
  query.forEach((value, name) => {
    if (!(name in record) && name !== "token") record[name] = value;
  });
  return record;
}

export function parseQrNotifyPayload(
  rawBody: string,
  contentType: string,
  query: URLSearchParams,
): QrNotifyPayload {
  const record = mergeRecord(rawBody, contentType, query);

  let amountFen: number | null = null;
  const fenText = (record.amount_fen ?? record.fen ?? "").trim();
  if (fenText) {
    const parsed = Number(fenText);
    amountFen = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } else {
    amountFen = yuanToFen(record.amount ?? record.money ?? record.total_fee ?? "");
  }
  if (amountFen === null) throw new QrNotifyPayloadError("回调金额缺失或非法");
  if (amountFen > 1_000_000) throw new QrNotifyPayloadError("回调金额超出上限");

  const tradeNo = (
    record.trade_no ??
    record.transaction_id ??
    record.txn_id ??
    ""
  ).trim();
  const outTradeNo = (record.out_trade_no ?? "").trim() || undefined;
  const remark = (record.remark ?? record.note ?? record.memo ?? "").trim() || undefined;
  const paidAt = (record.paid_at ?? record.time ?? "").trim() || undefined;

  return {
    amountFen,
    // 监听程序没有流水号时用金额+时间兜底；重复回调仍由 payment_events 去重。
    tradeNo:
      tradeNo ||
      `qr-${amountFen}-${paidAt || Math.floor(Date.now() / 1000)}-${record.nonce ?? ""}`,
    outTradeNo,
    remark,
    paidAt,
    raw: record,
  };
}
