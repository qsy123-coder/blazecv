import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  getCurrentUser,
  hashToken,
  sessionPublicId,
} from "./auth";
import { getDb } from "./db";

export type SessionInfo = {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};

async function currentTokenHash(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

/** 当前登录用户的所有有效会话；未登录返回 null。 */
export async function listSessions(): Promise<SessionInfo[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const current = await currentTokenHash();
  const database = await getDb();
  const result = await database.query<{
    token_hash: string;
    user_agent: string | null;
    created_at: string | Date;
    expires_at: string | Date;
  }>(
    `SELECT token_hash, user_agent, created_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND expires_at > now()
      ORDER BY created_at DESC`,
    [user.id],
  );

  return result.rows.map((row) => ({
    id: sessionPublicId(row.token_hash),
    current: row.token_hash === current,
    userAgent: row.user_agent,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  }));
}

/**
 * 退出指定会话。publicId 是 token 哈希的前 16 位（不可反推 token）。
 * 若退出的是当前会话，同时清除 cookie。
 */
export async function revokeSession(
  publicId: string,
): Promise<{ ok: boolean; current?: boolean } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const current = await currentTokenHash();
  if (!current) return null;
  if (!/^[a-f0-9]{16}$/.test(publicId)) return { ok: false };

  const database = await getDb();
  const found = await database.query<{ token_hash: string }>(
    `SELECT token_hash FROM sessions
      WHERE user_id = $1 AND left(token_hash, 16) = $2`,
    [user.id, publicId],
  );
  const target = found.rows[0];
  if (!target) return { ok: false };

  await database.query("DELETE FROM sessions WHERE token_hash = $1", [
    target.token_hash,
  ]);

  const isCurrent = target.token_hash === current;
  if (isCurrent) {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
  }
  return { ok: true, current: isCurrent };
}

/** 退出除当前会话外的所有设备。 */
export async function revokeOtherSessions(): Promise<{
  ok: boolean;
  revoked: number;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const current = await currentTokenHash();
  if (!current) return null;

  const database = await getDb();
  const result = await database.query(
    "DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING token_hash",
    [user.id, current],
  );
  return { ok: true, revoked: result.rows.length };
}
