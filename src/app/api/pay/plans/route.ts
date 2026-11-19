import { PAY_CHANNEL_LABELS } from "@/lib/pay-channels";
import { listPlans } from "@/lib/server/payments/plans";
import {
  activeProviderId,
  availableChannels,
  payEnabled,
  providerReady,
} from "@/lib/server/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      enabled: providerReady(),
      payEnabled: payEnabled(),
      provider: activeProviderId(),
      channels: availableChannels().map((id) => ({
        id,
        label: PAY_CHANNEL_LABELS[id],
      })),
      plans: listPlans(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
