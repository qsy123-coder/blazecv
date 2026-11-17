import { randomUUID } from "node:crypto";
import type { ResumeDoc } from "@/lib/types";
import { parseResumeObject } from "@/lib/schema";
import { getCurrentUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";

const MAX_DOC_BYTES = 1_000_000;

function unauthorized() {
  return Response.json({ error: "请先登录" }, { status: 401 });
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const database = await getDb();
  const result = await database.query<{
    id: string;
    doc: unknown;
    title: string;
    updated_at: unknown;
  }>(
    `SELECT id, doc, title, updated_at
       FROM user_resumes
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [user.id],
  );
  const row = result.rows[0];
  if (!row) {
    return Response.json(
      { resume: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const doc = (typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc) as ResumeDoc;
  return Response.json(
    {
      resume: {
        id: row.id,
        doc,
        title: row.title,
        updatedAt: toIso(row.updated_at),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = parseResumeObject((body as { doc?: unknown } | null)?.doc);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const id = validId(parsed.doc.id) ? parsed.doc.id : randomUUID();
  const doc: ResumeDoc = { ...parsed.doc, id };
  const serialized = JSON.stringify(doc);
  if (Buffer.byteLength(serialized, "utf8") > MAX_DOC_BYTES) {
    return Response.json({ error: "简历内容过大，无法保存" }, { status: 413 });
  }

  const database = await getDb();
  const result = await database.query<{ updated_at: unknown }>(
    `INSERT INTO user_resumes (user_id, id, title, doc, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (user_id, id)
     DO UPDATE SET title = EXCLUDED.title, doc = EXCLUDED.doc, updated_at = now()
     RETURNING updated_at`,
    [user.id, id, doc.title, serialized],
  );

  return Response.json({
    ok: true,
    id,
    updatedAt: toIso(result.rows[0].updated_at),
  });
}
