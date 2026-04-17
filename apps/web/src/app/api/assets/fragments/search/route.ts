import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { searchFragments } from "@/lib/repositories";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const body = await request.json();
  const result = await searchFragments(session.userId, body.query || "");
  return ok(
    result.map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilled_content,
      sourceType: fragment.source_type,
      createdAt: fragment.created_at,
      score: Number(fragment.score.toFixed(4)),
    })),
  );
}
