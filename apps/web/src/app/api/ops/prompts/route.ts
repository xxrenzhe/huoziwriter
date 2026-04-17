import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptVersion, getPromptVersions } from "@/lib/repositories";

export async function GET() {
  try {
    await requireOpsAccess();
    const prompts = await getPromptVersions();
    return ok(
      prompts.map((prompt) => ({
        id: prompt.id,
        promptId: prompt.prompt_id,
        version: prompt.version,
        category: prompt.category,
        name: prompt.name,
        description: prompt.description,
        filePath: prompt.file_path,
        functionName: prompt.function_name,
        promptContent: prompt.prompt_content,
        language: prompt.language,
        isActive: Boolean(prompt.is_active),
        autoMode: String(prompt.auto_mode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual",
        changeNotes: prompt.change_notes,
        rolloutObserveOnly: Boolean(prompt.rollout_observe_only),
        rolloutPercentage: prompt.rollout_percentage,
        rolloutPlanCodes: (() => {
          try {
            const parsed = JSON.parse(prompt.rollout_plan_codes_json || "[]") as unknown;
            return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
          } catch {
            return [];
          }
        })(),
        createdAt: prompt.created_at,
        updatedAt: prompt.updated_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireOpsAccess();
    const body = await request.json();
    await createPromptVersion({
      promptId: body.promptId,
      version: body.version,
      category: body.category,
      name: body.name,
      description: body.description,
      filePath: body.filePath,
      functionName: body.functionName,
      promptContent: body.promptContent,
      language: body.language,
      isActive: body.isActive ?? false,
      autoMode: body.autoMode,
      changeNotes: body.changeNotes,
      rolloutObserveOnly: body.rolloutObserveOnly ?? false,
      rolloutPercentage: Number(body.rolloutPercentage ?? 0),
      rolloutPlanCodes: Array.isArray(body.rolloutPlanCodes) ? body.rolloutPlanCodes : [],
      createdBy: operator.userId,
    });
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建 Prompt 版本失败", 400);
  }
}
