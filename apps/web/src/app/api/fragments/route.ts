import { fail } from "@/lib/http";

export async function GET() {
  return fail("旧 fragments API 已退场，请改用 /api/assets/fragments", 410);
}
