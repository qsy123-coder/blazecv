import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { parseResumeObject } from "@/lib/schema";
import { getCurrentUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { checkRateLimit, clientKey } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

interface ShareRow {
  [key: string]: unknown;
  token: string;
  updated_at: unknown;
  password_hash: string | null;
  expires_at: unknown;
}

function unauthorized() {
  return Response.json({ error: "请先登录" }, { status: 401 });
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  return toIso(value);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sharePayload(row: ShareRow | undefined, fallbackToken: string) {
  return {
    token: row?.token ?? fallbackToken,
    updatedAt: row?.updated_at ? toIso(row.updated_at) : new Date().toISOString(),
    hasPassword: Boolean(row?.password_hash),
    expiresAt: toIsoOrNull(row?.expires_at),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const database = await getDb();
  const result = await database.query<ShareRow>(
    "SELECT token, updated_at, password_hash, expires_at FROM shares WHERE user_id = $1",
    [user.id],
  );
  const row = result.rows[0];
  return Response.json(
    { share: row ? sharePayload(row, row.token) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const limit = checkRateLimit(clientKey(request, "share"), 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const source = (body ?? {}) as {
    doc?: unknown;
    password?: unknown;
    expiresInDays?: unknown;
  };
  const parsed = parseResumeObject(source.doc);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  let passwordHashPatch: string | null | undefined;
  if (source.password !== undefined) {
    if (source.password === null) {
      passwordHashPatch = null;
    } else if (typeof source.password === "string") {
      const password = source.password;
      if (password.length > 0) {
        if (password.length < 4 || Buffer.byteLength(password, "utf8") > 72) {
          return Response.json(
            { error: "分享密码需 4–72 字节" },
            { status: 400 },
          );
        }
        passwordHashPatch = await bcrypt.hash(password, 10);
      }
    } else {
      return Response.json({ error: "分享密码格式错误" }, { status: 400 });
    }
  }

  let expiresPatch: Date | null | undefined;
  if (source.expiresInDays !== undefined) {
    if (source.expiresInDays === null) {
      expiresPatch = null;
    } else if (
      typeof source.expiresInDays === "number" &&
      Number.isInteger(source.expiresInDays) &&
      source.expiresInDays >= 1 &&
      source.expiresInDays <= 365
    ) {
      expiresPatch = new Date(
        Date.now() + source.expiresInDays * 24 * 60 * 60 * 1000,
      );
    } else {
      return Response.json({ error: "有效期需为 1–365 天" }, { status: 400 });
    }
  }

  const database = await getDb();
  const existing = await database.query<ShareRow>(
    "SELECT token, updated_at, password_hash, expires_at FROM shares WHERE user_id = $1",
    [user.id],
  );
  const current = existing.rows[0];
  const token = current?.token ?? randomBytes(18).toString("base64url");

  const passwordHash =
    passwordHashPatch === undefined
      ? current?.password_hash ?? null
      : passwordHashPatch;
  const expiresAt =
    expiresPatch === undefined
      ? toDateOrNull(current?.expires_at)
      : expiresPatch;

  const result = await database.query<ShareRow>(
    `INSERT INTO shares (token, user_id, title, doc, password_hash, expires_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
     ON CONFLICT (user_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       doc = EXCLUDED.doc,
       password_hash = EXCLUDED.password_hash,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING token, updated_at, password_hash, expires_at`,
    [
      token,
      user.id,
      parsed.doc.title,
      JSON.stringify(parsed.doc),
      passwordHash,
      expiresAt,
    ],
  );

  return Response.json(sharePayload(result.rows[0], token));
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const database = await getDb();
  await database.query("DELETE FROM shares WHERE user_id = $1", [user.id]);
  return Response.json({ ok: true });
}
