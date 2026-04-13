import { PromptManagerClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getPromptVersions } from "@/lib/repositories";

export default async function AdminPromptsPage() {
  await requireAdminSession();
  const prompts = await getPromptVersions();
  return (
    <PromptManagerClient
      prompts={prompts.map((prompt) => ({
        id: prompt.id,
        promptId: prompt.prompt_id,
        version: prompt.version,
        category: prompt.category,
        name: prompt.name,
        isActive: Boolean(prompt.is_active),
        promptContent: prompt.prompt_content,
      }))}
    />
  );
}
