import { payErrorResponse } from "@/lib/server/payments/http";
import {
  filterQrCandidatesByRemark,
  findQrNotifyCandidates,
  fulfillOrder,
  getQrNotifyOrder,
} from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import {
  parseQrNotifyPayload,
  qrNotifyMatchMode,
  verifyQrNotifyRequest,
  type QrNotifyPayload,
} from "@/lib/server/payments/qrnotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 个人收款码监听回调。
 *
 * 监听程序（安卓通知转发 / PC 微信收款助手监听）在到账后回调：
 *   POST /api/pay/notify/qrnotify
 *   Header: x-qr-timestamp, x-qr-nonce, x-qr-signature
 *   Body: {"amount_fen":993,"trade_no":"...","remark":"可选","out_trade_no":"可选"}
 * 签名 = hex(HMAC-SHA256(QR_NOTIFY_SECRET, `${timestamp}.${nonce}.${rawBody}`))
 *
 * 不支持签名的监听 App 可用 GET /api/pay/notify/qrnotify?token=...&amount=9.93&trade_no=...
 * 生产环境应保持 HTTPS，并优先使用 HMAC 头。
 */
function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function resolveOrder(
  payload: QrNotifyPayload,
): Promise<
  | { ok: true; outTradeNo: string }
  | { ok: false; reason: "not_found" | "amount_mismatch" | "ambiguous" }
> {
  if (payload.outTradeNo) {
    const order = await getQrNotifyOrder(payload.outTradeNo);
    if (!order) return { ok: false, reason: "not_found" };
    if (order.amountFen !== payload.amountFen) {
      return { ok: false, reason: "amount_mismatch" };
    }
    return { ok: true, outTradeNo: order.outTradeNo };
  }

  let candidates = await findQrNotifyCandidates(payload.amountFen);
  if (qrNotifyMatchMode() === "remark") {
    candidates = filterQrCandidatesByRemark(candidates, payload.remark ?? "");
  }
  if (candidates.length === 0) return { ok: false, reason: "not_found" };
  if (candidates.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, outTradeNo: candidates[0].outTradeNo };
}

async function handle(request: Request): Promise<Response> {
  if (activeProviderId() !== "qrnotify") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  const url = new URL(request.url);
  let raw = "";
  if (request.method === "POST") {
    try {
      raw = await request.text();
    } catch {
      return json({ success: false, error: "读取回调失败" }, 400);
    }
  }

  try {
    verifyQrNotifyRequest(raw, request.headers, url.searchParams);
    const payload = parseQrNotifyPayload(
      raw,
      request.headers.get("content-type") ?? "",
      url.searchParams,
    );

    const resolved = await resolveOrder(payload);
    if (!resolved.ok) {
      // 返回 200，监听程序通常会对非 2xx 无限重试；未匹配需要人工核对。
      return json({ success: true, matched: false, reason: resolved.reason });
    }

    const result = await fulfillOrder(resolved.outTradeNo, {
      providerTradeNo: payload.tradeNo,
      amountFen: payload.amountFen,
      eventId: `qrnotify:${payload.tradeNo}:${payload.amountFen}`,
      eventType: "QR.NOTIFY",
      payload: payload.raw,
    });

    if (!result.ok) {
      return json({
        success: false,
        matched: true,
        outTradeNo: resolved.outTradeNo,
        reason: result.reason ?? "fulfill_failed",
      });
    }

    return json({
      success: true,
      matched: true,
      outTradeNo: resolved.outTradeNo,
      paid: true,
    });
  } catch (error) {
    return payErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
