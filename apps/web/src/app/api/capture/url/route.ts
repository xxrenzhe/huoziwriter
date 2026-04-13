import { ensureUserSession } from "@/lib/auth";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota } from "@/lib/plan-access";
import { createFragment, queueJob } from "@/lib/repositories";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await assertFragmentQuota(session.userId);
  const body = await request.json();
  const distilled = await distillCaptureInput({
    sourceType: "url",
    title: body.title || "URL 碎片",
    url: body.url,
  });
  const fragment = await createFragment({
    userId: session.userId,
    sourceType: "url",
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
    sourceUrl: distilled.sourceUrl,
  });
  await queueJob("capture", { fragmentId: fragment?.id, sourceType: "url", url: body.url });
  return ok(fragment);
}
