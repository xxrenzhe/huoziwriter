import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getActiveTemplates } from "@/lib/marketplace";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  return ok(await getActiveTemplates());
}
