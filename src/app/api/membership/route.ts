import { getCurrentUser } from "@/lib/server/auth";
import { getMembershipStatus } from "@/lib/server/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const membership = await getMembershipStatus(user?.id);
  return Response.json(
    { ...membership, loggedIn: Boolean(user) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
