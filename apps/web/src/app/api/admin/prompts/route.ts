import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptVersion, getPromptVersions } from "@/lib/repositories";

export async function GET() {
  try {
    await requireAdmin();
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
        changeNotes: prompt.change_notes,
        createdAt: prompt.created_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
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
      changeNotes: body.changeNotes,
      createdBy: admin.userId,
    });
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建 Prompt 版本失败", 400);
  }
}
