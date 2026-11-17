import { getCurrentUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const database = await getDb();
  const result = await database.query<{
    id: string;
    title: string;
    updated_at: unknown;
  }>(
    "SELECT id, title, updated_at FROM user_resumes WHERE user_id = $1 ORDER BY updated_at DESC",
    [user.id],
  );

  return Response.json(
    {
      resumes: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : new Date(String(row.updated_at)).toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
