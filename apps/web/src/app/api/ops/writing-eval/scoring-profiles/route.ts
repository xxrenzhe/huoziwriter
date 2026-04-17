import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createWritingEvalScoringProfile, getWritingEvalScoringProfiles } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireOpsAccess();
    return ok(await getWritingEvalScoringProfiles());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireOpsAccess();
    const body = await request.json();
    return ok(
      await createWritingEvalScoringProfile({
        code: body.code,
        name: body.name,
        description: body.description,
        config: body.config && typeof body.config === "object" && !Array.isArray(body.config) ? body.config : {},
        isActive: body.isActive,
        createdBy: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建评分画像失败", 400);
  }
}
