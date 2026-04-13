import { fail, ok } from "@/lib/http";
import { analyzeAiNoise } from "@/lib/ai-noise-scan";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const content = String(body.content || "");
    if (!content.trim()) {
      return fail("请先输入需要扫描的草稿", 400);
    }
    return ok(analyzeAiNoise(content));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "扫描失败", 400);
  }
}
