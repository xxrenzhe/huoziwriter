import { getMockKnowledgeBaseMap, ok } from "../../../../_shared";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.map((item: unknown) => String(item || "").trim()) : [];
  return ok({
    infos: getMockKnowledgeBaseMap(ids),
  });
}
