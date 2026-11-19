import { getCurrentUser } from "./auth";
import { getDb } from "./db";

export interface MembershipStatus {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
}

export const FREE_MEMBERSHIP: MembershipStatus = {
  active: false,
  plan: null,
  expiresAt: null,
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function getMembershipStatus(
  userId: string | null | undefined,
): Promise<MembershipStatus> {
  if (!userId) return FREE_MEMBERSHIP;
  const database = await getDb();
  const result = await database.query<{
    plan: string;
    expires_at: unknown;
  }>(
    "SELECT plan, expires_at FROM memberships WHERE user_id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) return FREE_MEMBERSHIP;

  const expiresAt = toIso(row.expires_at);
  const active = expiresAt !== null && new Date(expiresAt).getTime() > Date.now();
  return {
    active,
    plan: active ? row.plan : null,
    expiresAt,
  };
}

export async function isActiveMember(userId: string): Promise<boolean> {
  const status = await getMembershipStatus(userId);
  return status.active;
}

/**
 * Whether an export must carry a watermark.
 *
 * PAY_ENABLED=false keeps the pre-payment behaviour (no watermark) so the
 * existing acceptance/fidelity suites keep their baseline. When payments are on,
 * anonymous users and expired members get a watermark, and a database failure
 * fails closed (watermark) rather than granting a free clean export.
 */
export async function exportWatermarkRequired(): Promise<boolean> {
  if (process.env.PAY_ENABLED !== "true") return false;
  try {
    const user = await getCurrentUser();
    if (!user) return true;
    return !(await isActiveMember(user.id));
  } catch {
    return true;
  }
}
