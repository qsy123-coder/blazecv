import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parseWechatNotify } from "@/lib/server/payments/wechat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WeChat Pay v3 notification endpoint.
 *
 * The body must be read as raw text before JSON parsing: the signature is over
 * the exact bytes WeChat sent.
 */
export async function POST(request: Request) {
  if (activeProviderId() !== "wechat") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ code: "FAIL", message: "读取回调失败" }, { status: 400 });
  }

  try {
    const notify = await parseWechatNotify(raw, request.headers);

    // Only a successful transaction grants membership. Other event types are
    // acknowledged so WeChat stops retrying, but change nothing.
    if (notify.tradeState !== "SUCCESS") {
      return Response.json({ code: "SUCCESS", message: "成功" });
    }

    await fulfillOrder(notify.outTradeNo, {
      providerTradeNo: notify.transactionId || undefined,
      amountFen: notify.amountFen,
      eventId: notify.notificationId,
      eventType: notify.eventType,
      payload: notify.raw,
    });

    // Acknowledging an amount mismatch prevents an endless retry loop; the
    // order is marked failed and the event row keeps the evidence.
    return Response.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    return payErrorResponse(error);
  }
}
