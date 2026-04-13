import { getDatabase } from "@/lib/db";

export async function GET() {
  const db = getDatabase();
  const checkedAt = new Date().toISOString();

  try {
    const result = await db.queryOne<{ ok: number }>("SELECT 1 as ok");
    return Response.json(
      {
        ok: true,
        service: "huoziwriter-web",
        database: db.type,
        checkedAt,
        result: result?.ok === 1 ? "ok" : "unknown",
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "huoziwriter-web",
        database: db.type,
        checkedAt,
        error: error instanceof Error ? error.message : "health check failed",
      },
      { status: 503 },
    );
  }
}
