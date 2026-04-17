import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createCalibratedWritingEvalScoringProfile } from "@/lib/writing-eval";

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    return ok(
      await createCalibratedWritingEvalScoringProfile({
        baseProfileId: Number(body.baseProfileId),
        code: body.code,
        name: body.name,
        description: body.description,
        isActive: body.isActive,
        createdBy: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建校准版评分画像失败", 400);
  }
}
