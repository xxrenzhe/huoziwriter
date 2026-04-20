import { buildMockKnowledgeSearchResults, ok } from "../../../../_shared";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query || "").trim();
  const knowledgeBaseId = String(body?.knowledge_base_id || "").trim() || "kb-hot-topics";
  return ok({
    info_list: buildMockKnowledgeSearchResults(query, knowledgeBaseId),
    next_cursor: "",
    is_end: true,
  });
}
