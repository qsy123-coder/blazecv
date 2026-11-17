import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export type CodePurpose = "login" | "register" | "reset";

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const CODE_TTL_SECONDS = positiveInt(
  process.env.SMS_CODE_TTL_SECONDS,
  DEFAULT_TTL_SECONDS,
);
export const CODE_RESEND_SECONDS = positiveInt(
  process.env.SMS_CODE_RESEND_SECONDS,
  DEFAULT_RESEND_SECONDS,
);

export interface IssuedCode {
  id: string;
  code: string;
  expiresAt: Date;
}

function hashCode(account: string, purpose: CodePurpose, code: string): string {
  return createHash("sha256")
    .update(`${account}:${purpose}:${code}`)
    .digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/**
 * 生成并保存一次性验证码。同一账号 60 秒内重复请求返回 retryAfter，
 * 新码签发时作废该账号同用途的旧码。
 */
export async function issueCode(
  account: string,
  purpose: CodePurpose,
): Promise<IssuedCode | { retryAfter: number }> {
  const database = await getDb();

  const latest = await database.query<{ created_at: Date | string }>(
    `SELECT created_at FROM verify_codes
      WHERE account = $1 AND purpose = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [account, purpose],
  );
  if (latest.rows[0]) {
    const createdAt = new Date(latest.rows[0].created_at).getTime();
    const elapsed = (Date.now() - createdAt) / 1000;
    if (elapsed < CODE_RESEND_SECONDS) {
      return { retryAfter: Math.ceil(CODE_RESEND_SECONDS - elapsed) };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);
  const id = randomUUID();

  await database.query(
    `UPDATE verify_codes SET consumed_at = now()
      WHERE account = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [account, purpose],
  );
  await database.query(
    `INSERT INTO verify_codes (id, account, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, account, purpose, hashCode(account, purpose, code), expiresAt],
  );
  await database.query(
    `DELETE FROM verify_codes WHERE created_at < now() - interval '1 day'`,
  );

  return { id, code, expiresAt };
}

/** 发送失败时丢弃刚生成的码，避免占用 60 秒重发冷却。 */
export async function discardCode(id: string): Promise<void> {
  const database = await getDb();
  await database.query("DELETE FROM verify_codes WHERE id = $1", [id]);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "invalid" | "too_many" };

/** 校验并消费验证码：成功即标记 consumed，失败累计次数，超过上限直接作废。 */
export async function verifyCode(
  account: string,
  purpose: CodePurpose,
  code: string,
): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid" };

  const database = await getDb();
  const result = await database.query<{
    id: string;
    code_hash: string;
    attempts: number;
  }>(
    `SELECT id, code_hash, attempts FROM verify_codes
      WHERE account = $1 AND purpose = $2
        AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [account, purpose],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) {
    await database.query(
      "UPDATE verify_codes SET consumed_at = now() WHERE id = $1",
      [row.id],
    );
    return { ok: false, reason: "too_many" };
  }

  if (!safeEqualHex(row.code_hash, hashCode(account, purpose, code))) {
    const nextAttempts = row.attempts + 1;
    await database.query(
      nextAttempts >= MAX_ATTEMPTS
        ? "UPDATE verify_codes SET attempts = $2, consumed_at = now() WHERE id = $1"
        : "UPDATE verify_codes SET attempts = $2 WHERE id = $1",
      [row.id, nextAttempts],
    );
    return {
      ok: false,
      reason: nextAttempts >= MAX_ATTEMPTS ? "too_many" : "invalid",
    };
  }

  // 条件更新保证并发下只有一次校验成功。
  const consumed = await database.query(
    "UPDATE verify_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
    [row.id],
  );
  return consumed.rows.length > 0
    ? { ok: true }
    : { ok: false, reason: "expired" };
}
