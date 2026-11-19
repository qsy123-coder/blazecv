import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parseXunhuNotify } from "@/lib/server/payments/xunhu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 虎皮椒异步通知。后台「支付通知」填 https://aetouban.cn/api/pay/notify/xunhu
 * 成功响应体必须是 `success`。
 */
export async function POST(request: Request) {
  if (activeProviderId() !== "xunhu") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response("fail", { status: 400 });
  }

  try {
    const notify = parseXunhuNotify(
      raw,
      request.headers.get("content-type") ?? "",
    );
    if (notify.status !== "OD") {
      return new Response("success", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    await fulfillOrder(notify.outTradeNo, {
      providerTradeNo: notify.providerTradeNo || undefined,
      amountFen: notify.amountFen,
      eventId: notify.eventId,
      eventType: "XUNHU.NOTIFY",
      payload: notify.raw,
    });
    return new Response("success", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return payErrorResponse(error);
  }
}
