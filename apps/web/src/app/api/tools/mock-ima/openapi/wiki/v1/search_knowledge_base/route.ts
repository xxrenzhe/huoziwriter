import { getMockKnowledgeBases, ok } from "../../../../_shared";

export async function POST() {
  return ok({
    info_list: getMockKnowledgeBases().map((item) => ({
      id: item.id,
      name: item.name,
    })),
    is_end: true,
    next_cursor: "",
  });
}
