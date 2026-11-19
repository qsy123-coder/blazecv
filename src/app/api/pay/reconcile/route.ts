import { timingSafeEqual } from "node:crypto";
import { payErrorResponse } from "@/lib/server/payments/http";
import { reconcilePendingOrders } from "@/lib/server/payments/orders";
import { payEnabled } from "@/lib/server/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 对账补齐：回调丢失时主动查单（易支付 / PayJS / 虎皮椒）。
 *
 * 需要 PAY_ADMIN_TOKEN；未配置时路由表现为 404。
 *   curl -X POST https://aetouban.cn/api/pay/reconcile \
 *     -H "x-admin-token: $PAY_ADMIN_TOKEN"
 *
 * 可放进 systemd timer / cron，每 5–10 分钟执行一次。
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = (process.env.PAY_ADMIN_TOKEN ?? "").trim();
  if (!expected) return Response.json({ error: "接口不存在" }, { status: 404 });

  const bearer = request.headers.get("authorization") ?? "";
  const provided =
    request.headers.get("x-admin-token") ??
    (bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "");

  if (!provided || !safeEqual(provided, expected)) {
    return Response.json({ error: "无权限" }, { status: 401 });
  }
  if (!payEnabled()) {
    return Response.json({ error: "支付暂未开通" }, { status: 503 });
  }

  const raw = new URL(request.url).searchParams.get("limit");
  const limit = Number(raw ?? 50);
  try {
    const summary = await reconcilePendingOrders(
      Number.isInteger(limit) ? limit : 50,
    );
    return Response.json(
      { ok: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return payErrorResponse(error);
  }
}
