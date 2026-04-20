import { ensureUserSession } from "@/lib/auth";
import { createImaConnection, listImaConnections } from "@/lib/ima-connections";
import { fail, ok } from "@/lib/http";

function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  return ok({
    connections: await listImaConnections(session.userId),
  });
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const label = sanitizeText(body.label, 80);
    const clientId = sanitizeText(body.clientId, 200);
    const apiKey = sanitizeText(body.apiKey, 200);
    if (!label || !clientId || !apiKey) {
      throw new Error("请填写完整的 IMA 标签、Client ID 和 API Key");
    }
    return ok(await createImaConnection({
      userId: session.userId,
      label,
      clientId,
      apiKey,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "IMA 连接创建失败", 400);
  }
}
