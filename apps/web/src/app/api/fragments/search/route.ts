import { fail } from "@/lib/http";

export async function POST() {
  return fail("旧 fragments 搜索 API 已退场，请改用 /api/assets/fragments/search", 410);
}
