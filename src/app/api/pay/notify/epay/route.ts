import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parseEpayNotify } from "@/lib/server/payments/epay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 易支付（彩虹易支付）异步通知。在商户后台把回调地址填成
 * https://aetouban.cn/api/pay/notify/epay
 *
 * 易支付要求响应体恰好是 `success`，否则会按策略重试。
 */
function ack(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function collectParams(request: Request): Promise<URLSearchParams> {
  const url = new URL(request.url);
  if (request.method === "GET") return url.searchParams;

  const raw = await request.text();
  const contentType = request.headers.get("content-type") ?? "";
  const params = new URLSearchParams();

  if (raw.trim()) {
    if (contentType.includes("json") || raw.trim().startsWith("{")) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [name, value] of Object.entries(parsed)) {
        if (value !== null && value !== undefined) params.set(name, String(value));
      }
    } else {
      new URLSearchParams(raw).forEach((value, name) => params.set(name, value));
    }
  }
  // 签名只覆盖网关发送的那一份参数；查询串只补缺失字段。
  url.searchParams.forEach((value, name) => {
    if (!params.has(name)) params.set(name, value);
  });
  return params;
}

async function handle(request: Request): Promise<Response> {
  if (activeProviderId() !== "epay") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let params: URLSearchParams;
  try {
    params = await collectParams(request);
  } catch {
    return ack("fail", 400);
  }

  try {
    const notify = parseEpayNotify(params);
    if (notify.tradeStatus !== "TRADE_SUCCESS") {
      return ack("success");
    }

    await fulfillOrder(notify.outTradeNo, {
      providerTradeNo: notify.providerTradeNo || undefined,
      amountFen: notify.amountFen,
      eventId: notify.eventId,
      eventType: notify.tradeStatus,
      payload: notify.raw,
    });
    return ack("success");
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
