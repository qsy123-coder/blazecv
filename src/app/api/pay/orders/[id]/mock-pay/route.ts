import { getCurrentUser } from "@/lib/server/auth";
import { payErrorResponse } from "@/lib/server/payments/http";
import { applyMockPaid } from "@/lib/server/payments/orders";
import { activeProviderId } from "@/lib/server/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // The mock route only exists in mock mode; never expose it in production.
  if (activeProviderId() !== "mock") {
    return Response.json({ error: "接口不存在" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await applyMockPaid(user.id, id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return payErrorResponse(error);
  }
}
