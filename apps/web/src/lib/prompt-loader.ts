import { getDatabase } from "./db";

const cache = new Map<string, { content: string; version: string; at: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function loadPrompt(promptId: string) {
  const cached = cache.get(promptId);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.content;
  }

  const db = getDatabase();
  const prompt = await db.queryOne<{
    prompt_content: string;
    version: string;
  }>(
    `SELECT prompt_content, version
     FROM prompt_versions
     WHERE prompt_id = ? AND is_active = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [promptId, true],
  );

  if (!prompt) {
    throw new Error(`Prompt not found: ${promptId}`);
  }

  cache.set(promptId, { content: prompt.prompt_content, version: prompt.version, at: Date.now() });
  return prompt.prompt_content;
}

export function clearPromptCache(promptId?: string) {
  if (promptId) {
    cache.delete(promptId);
    return;
  }
  cache.clear();
}
