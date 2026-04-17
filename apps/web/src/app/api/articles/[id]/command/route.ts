import { fail } from "@/lib/http";

export async function POST() {
  return fail("旧 command API 已退场，不再作为独立能力开放。", 410);
}
