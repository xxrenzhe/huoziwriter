import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateWritingEvalScoringProfile } from "@/lib/writing-eval";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAccess();
    const { id } = await params;
    const profileId = Number(id);
    if (!Number.isInteger(profileId) || profileId <= 0) {
      return fail("评分画像无效", 400);
    }
    const body = await request.json().catch(() => ({}));
    return ok(
      await updateWritingEvalScoringProfile({
        profileId,
        code: body.code,
        name: body.name,
        description: body.description,
        config: body.config && typeof body.config === "object" && !Array.isArray(body.config) ? body.config : undefined,
        isActive: body.isActive,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新评分画像失败", 400);
  }
}
