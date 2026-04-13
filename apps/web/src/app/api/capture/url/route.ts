import { ensureUserSession } from "@/lib/auth";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota } from "@/lib/plan-access";
import { createFragment, queueJob } from "@/lib/repositories";

type CaptureFragmentRecord = {
  id: number;
  user_id: number;
  source_type: string;
  title: string | null;
  raw_content: string | null;
  distilled_content: string;
  source_url?: string | null;
  screenshot_path?: string | null;
  created_at: string;
  updated_at: string;
};

function mapFragment(fragment: CaptureFragmentRecord) {
  return {
    id: fragment.id,
    userId: fragment.user_id,
    sourceType: fragment.source_type,
    title: fragment.title,
    rawContent: fragment.raw_content,
    distilledContent: fragment.distilled_content,
    sourceUrl: fragment.source_url ?? null,
    screenshotPath: fragment.screenshot_path ?? null,
    createdAt: fragment.created_at,
    updatedAt: fragment.updated_at,
  };
}

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
  await queueJob("capture", {
    fragmentId: fragment?.id,
    sourceType: "url",
    url: body.url,
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
    degradedReason: distilled.degradedReason ?? null,
    retryUrlFetch: Boolean(distilled.retryRecommended),
    retryDistill: Boolean(distilled.retryRecommended),
  });
  return ok(fragment ? mapFragment(fragment as CaptureFragmentRecord) : null);
}
