import { getCurrentUser } from "@/lib/server/auth";
import { getMembershipStatus } from "@/lib/server/membership";
import { payErrorResponse } from "@/lib/server/payments/http";
import { getOrderForUser } from "@/lib/server/payments/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await params;
  try {
    const order = await getOrderForUser(user.id, id);
    if (!order) return Response.json({ error: "订单不存在" }, { status: 404 });
    const membership = await getMembershipStatus(user.id);
    return Response.json(
      { order, membership },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return payErrorResponse(error);
  }
}
