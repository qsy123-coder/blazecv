import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ResumeDoc } from "@/lib/types";
import { parseResumeObject } from "@/lib/schema";
import { getDocTemplate, resolveTokens } from "@/lib/templates";
import { getDb } from "@/lib/server/db";
import { ShareView } from "@/components/share/ShareView";
import { ShareGate } from "@/components/share/ShareGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShareState =
  | { status: "missing" }
  | { status: "locked" }
  | { status: "ok"; doc: ResumeDoc };

async function loadShared(token: string): Promise<ShareState> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { status: "missing" };

  const database = await getDb();
  const result = await database.query<{
    doc: unknown;
    password_hash: string | null;
    expires_at: unknown;
  }>("SELECT doc, password_hash, expires_at FROM shares WHERE token = $1", [
    token,
  ]);
  const row = result.rows[0];
  if (!row) return { status: "missing" };

  if (row.expires_at) {
    const expiresAt = new Date(String(row.expires_at)).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return { status: "missing" };
    }
  }

  if (row.password_hash) return { status: "locked" };

  const parsed = parseResumeObject(
    typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc,
  );
  return parsed.ok ? { status: "ok", doc: parsed.doc } : { status: "missing" };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const state = await loadShared(token).catch(() => ({ status: "missing" as const }));
  const title =
    state.status === "ok"
      ? `${state.doc.basics.name || state.doc.title} · 简历`
      : state.status === "locked"
        ? "受密码保护的简历"
        : "分享的简历";
  return {
    title,
    robots: { index: false, follow: false },
  };
}

export default async function SharedResumePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await loadShared(token);
  if (state.status === "missing") notFound();
  if (state.status === "locked") return <ShareGate token={token} />;

  const tokens = resolveTokens(getDocTemplate(state.doc), state.doc.theme);
  return <ShareView doc={state.doc} tokens={tokens} />;
}
