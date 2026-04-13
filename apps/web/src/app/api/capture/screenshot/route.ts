import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureUserSession } from "@/lib/auth";
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

function detectUploadDir() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "public"))) {
    return path.join(cwd, "public", "uploads");
  }
  return path.join(cwd, "apps", "web", "public", "uploads");
}

async function persistScreenshot(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("截图数据格式不合法");
  }
  const [, mimeType, encoded] = match;
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const uploadDir = detectUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filename = `capture-${Date.now()}-${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDir, filename), Buffer.from(encoded, "base64"));
  return `/uploads/${filename}`;
}

export async function POST(request: Request) {
  try {
    const session = await ensureUserSession();
    if (!session) {
      return fail("未登录", 401);
    }
    await assertFragmentQuota(session.userId);
    const body = await request.json();
    const title = String(body.title || "截图碎片").trim() || "截图碎片";
    const note = String(body.note || "").trim();
    if (!body.imageDataUrl || typeof body.imageDataUrl !== "string") {
      return fail("截图模式必须上传真实图片文件", 400);
    }
    const screenshotPath = await persistScreenshot(body.imageDataUrl);
    const placeholder = note || "截图已上传，等待视觉理解。";
    const fragment = await createFragment({
      userId: session.userId,
      sourceType: "screenshot",
      title,
      rawContent: placeholder,
      distilledContent: placeholder,
      screenshotPath,
    });
    await queueJob("visionNote", {
      fragmentId: fragment?.id,
      sourceType: "screenshot",
      screenshotPath,
      title,
      note,
    });
    return ok(fragment ? mapFragment(fragment as CaptureFragmentRecord) : null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "截图写入失败", 400);
  }
}
