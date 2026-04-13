import { changeUserPassword, ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    await changeUserPassword({
      userId: session.userId,
      currentPassword: String(body.currentPassword || ""),
      nextPassword: String(body.nextPassword || ""),
    });
    return ok({ changed: true, role: session.role });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "修改密码失败", 400);
  }
}
