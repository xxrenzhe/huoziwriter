import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getFragmentsByUser } from "@/lib/repositories";

function parseFragmentSourceMeta(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const payload = JSON.parse(value) as Record<string, unknown>;
    const sourceMeta = payload?.sourceMeta;
    return sourceMeta && typeof sourceMeta === "object" && !Array.isArray(sourceMeta)
      ? sourceMeta
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const fragments = await getFragmentsByUser(session.userId);
  return ok(
    fragments.map((fragment) => ({
      id: fragment.id,
      sourceType: fragment.source_type,
      title: fragment.title,
      rawContent: fragment.raw_content,
      distilledContent: fragment.distilled_content,
      sourceUrl: fragment.source_url,
      screenshotPath: fragment.screenshot_path,
      sourceMeta: parseFragmentSourceMeta(fragment.raw_payload_json),
      createdAt: fragment.created_at,
    })),
  );
}
