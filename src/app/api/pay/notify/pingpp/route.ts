import { payErrorResponse } from "@/lib/server/payments/http";
import { fulfillOrder } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";
import { parsePingppWebhook } from "@/lib/server/payments/pingpp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ping++ Webhook endpoint. Configure it in the Ping++ dashboard as
 * https://aetouban.cn/api/pay/notify/pingpp for charge.succeeded.
 *
 * Signature is RSA-SHA256 over the exact raw body, verified with the Ping++
 * public key (Dashboard -> 开发信息 -> Ping++ 公钥).
 */
export async function POST(request: Request) {
  if (activeProviderId() !== "pingpp") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ success: false }, { status: 400 });
  }

  try {
    const event = await parsePingppWebhook(raw, request.headers);
    // charge.succeeded is authoritative; some event payloads omit `paid`.
    if (event.type !== "charge.succeeded") {
      return Response.json({ success: true });
    }

    await fulfillOrder(event.charge.order_no, {
      providerTradeNo: event.charge.id,
      amountFen: Number(event.charge.amount),
      eventId: event.eventId,
      eventType: event.type,
      payload: event.charge,
    });
    return Response.json({ success: true });
  } catch (error) {
    return payErrorResponse(error);
  }
}
