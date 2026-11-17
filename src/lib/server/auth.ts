import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const SESSION_COOKIE = "blazecv_session";
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  hasPassword: boolean;
}

export function newUserId(): string {
  return randomUUID();
}

/**
 * 只开放 QQ 邮箱与网易邮箱：qq.com / foxmail.com 属于 QQ 邮箱，
 * 163.com / 126.com / yeah.net 属于网易邮箱。其余域名一律拒绝。
 */
export const ALLOWED_EMAIL_DOMAINS = [
  "qq.com",
  "foxmail.com",
  "163.com",
  "126.com",
  "yeah.net",
] as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function emailDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

export function isAllowedEmail(email: string): boolean {
  const domain = emailDomainOf(email);
  return (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export function allowedEmailText(): string {
  return "仅支持 QQ 邮箱（qq.com / foxmail.com）和网易邮箱（163.com / 126.com / yeah.net）";
}

/** 去掉空格、横线和 +86 前缀，只留 11 位大陆手机号。 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s-]/g, "");
  return digits.startsWith("+86") ? digits.slice(3) : digits;
}

export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export type LoginIdentifier =
  | { kind: "phone"; value: string }
  | { kind: "email"; value: string };

/** 一个输入框同时接受手机号与邮箱，按字符形态判定账号类型。 */
export function parseIdentifier(raw: string): LoginIdentifier {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: normalizeEmail(trimmed) };
  }
  return { kind: "phone", value: normalizePhone(trimmed) };
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionPublicId(tokenHash: string): string {
  return tokenHash.slice(0, 16);
}

export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const database = await getDb();

  await database.query("DELETE FROM sessions WHERE expires_at < now()");
  await database.query(
    "INSERT INTO sessions (token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, $4)",
    [hashToken(token), userId, userAgent?.slice(0, 512) ?? null, expiresAt],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const database = await getDb();
  const result = await database.query<{
    id: string;
    email: string | null;
    phone: string | null;
    has_password: boolean;
  }>(
    `SELECT u.id, u.email, u.phone, (u.password_hash IS NOT NULL) AS has_password
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    hasPassword: Boolean(row.has_password),
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = await getDb();
    await database.query("DELETE FROM sessions WHERE token_hash = $1", [
      hashToken(token),
    ]);
  }
  store.delete(SESSION_COOKIE);
}
