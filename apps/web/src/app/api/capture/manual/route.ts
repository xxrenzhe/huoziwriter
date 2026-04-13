import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { distillCaptureInput } from "@/lib/distill";
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
    sourceType: "manual",
    title: body.title || "手动碎片",
    content: body.content,
  });
  const fragment = await createFragment({
    userId: session.userId,
    sourceType: "manual",
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
  });
  await queueJob("capture", { fragmentId: fragment?.id, sourceType: "manual" });
  return ok(fragment);
}
