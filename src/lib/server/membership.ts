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

export interface ExportGate {
  /** Whether the membership/payment feature is enabled (PAY_ENABLED=true). */
  payEnabled: boolean;
  /** Whether this request may export at all (members only when payEnabled). */
  allowed: boolean;
  /** Active membership (meaningful only when payEnabled). */
  active: boolean;
  loggedIn: boolean;
}

/**
 * Authoritative export gate.
 *
 * When payments are enabled, exports are members-only: anonymous and expired
 * members are blocked (403 upstream), and a database failure fails closed
 * (blocked) rather than granting a free export. When payments are disabled
 * (local dev / acceptance) exports stay open with no watermark, preserving the
 * pre-payment behaviour the suites rely on.
 */
export async function exportGate(): Promise<ExportGate> {
  if (process.env.PAY_ENABLED !== "true") {
    return { payEnabled: false, allowed: true, active: false, loggedIn: false };
  }
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { payEnabled: true, allowed: false, active: false, loggedIn: false };
    }
    const active = await isActiveMember(user.id);
    return { payEnabled: true, allowed: active, active, loggedIn: true };
  } catch {
    return { payEnabled: true, allowed: false, active: false, loggedIn: false };
  }
}
