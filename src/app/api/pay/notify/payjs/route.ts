import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parsePayjsNotify } from "@/lib/server/payments/payjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayJS 异步通知。后台「支付回调」填 https://aetouban.cn/api/pay/notify/payjs
 * 成功响应体必须是 `success`。
 */
export async function POST(request: Request) {
  if (activeProviderId() !== "payjs") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response("fail", { status: 400 });
  }

  try {
    const notify = parsePayjsNotify(
      raw,
      request.headers.get("content-type") ?? "",
    );
    if (Number(notify.raw.return_code) !== 1) {
      return new Response("success", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    await fulfillOrder(notify.outTradeNo, {
      providerTradeNo: notify.providerTradeNo || undefined,
      amountFen: notify.amountFen,
      eventId: notify.eventId,
      eventType: "PAYJS.NOTIFY",
      payload: notify.raw,
    });
    return new Response("success", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return payErrorResponse(error);
  }
}
