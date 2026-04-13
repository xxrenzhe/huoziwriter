import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { activatePromptVersion, getPromptDetail } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { promptId: string } }) {
  try {
    await requireAdmin();
    const versions = await getPromptDetail(params.promptId);
    return ok(
      versions.map((prompt) => ({
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
        changeNotes: prompt.change_notes,
        createdAt: prompt.created_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function PUT(request: Request, { params }: { params: { promptId: string } }) {
  try {
    await requireAdmin();
    const body = await request.json();
    await activatePromptVersion(params.promptId, body.version);
    return ok({ activated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "激活版本失败", 400);
  }
}
