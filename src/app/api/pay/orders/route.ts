import { getCurrentUser } from "@/lib/server/auth";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";
import { isPayChannel } from "@/lib/pay-channels";
import { payErrorResponse, sameOrigin } from "@/lib/server/payments/http";
import { createOrder } from "@/lib/server/payments/orders";
import { isPlanId } from "@/lib/server/payments/plans";
import { availableChannels } from "@/lib/server/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "请求来源不合法" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const byUser = checkRateLimit(`pay-order:${user.id}`, 10, 60 * 60 * 1000);
  if (!byUser.ok) {
    return Response.json(
      { error: "下单过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(byUser.retryAfter) } },
    );
  }
  const byIp = checkRateLimit(clientKey(request, "pay-order"), 30, 60 * 60 * 1000);
  if (!byIp.ok) {
    return Response.json(
      { error: "下单过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const plan = (body as { plan?: unknown } | null)?.plan;
  if (!isPlanId(plan)) {
    return Response.json({ error: "会员档位不存在" }, { status: 400 });
  }

  if (process.env.PAY_ENABLED !== "true") {
    return Response.json({ error: "支付暂未开通" }, { status: 503 });
  }

  const rawChannel = (body as { channel?: unknown } | null)?.channel;
  const channel = rawChannel === undefined ? "wechat" : rawChannel;
  if (!isPayChannel(channel)) {
    return Response.json({ error: "支付方式不存在" }, { status: 400 });
  }
  if (!availableChannels().includes(channel)) {
    return Response.json({ error: "该支付方式暂不可用" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1";

  try {
    const order = await createOrder(user.id, plan, channel, clientIp);
    return Response.json(
      { order },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return payErrorResponse(error);
  }
}
