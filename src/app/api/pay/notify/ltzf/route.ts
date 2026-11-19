import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parseLtzfNotify } from "@/lib/server/payments/ltzf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 蓝兔支付异步通知。后台「支付通知」填
 * https://aetouban.cn/api/pay/notify/ltzf
 * 成功响应体必须是大写 `SUCCESS`。
 */
function ack(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  if (activeProviderId() !== "ltzf") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return ack("FAIL", 400);
  }

  try {
    const notify = parseLtzfNotify(
      raw,
      request.headers.get("content-type") ?? "",
    );
    if (!notify.success) {
      return ack("SUCCESS");
    }

    await fulfillOrder(notify.outTradeNo, {
      providerTradeNo: notify.providerTradeNo || undefined,
      amountFen: notify.amountFen,
      eventId: notify.eventId,
      eventType: "LTZF.NOTIFY",
      payload: notify.raw,
    });
    return ack("SUCCESS");
  } catch (error) {
    return payErrorResponse(error);
  }
}
