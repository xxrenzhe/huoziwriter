import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertWechatConnectionQuota } from "@/lib/plan-access";
import { getWechatConnections, upsertWechatConnection } from "@/lib/repositories";
import { encryptWechatConnection, verifyWechatCredential } from "@/lib/wechat";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const connections = await getWechatConnections(session.userId);
  return ok(
    connections.map((connection) => ({
      id: connection.id,
      accountName: connection.account_name,
      originalId: connection.original_id,
      status: connection.status,
      accessTokenExpiresAt: connection.access_token_expires_at,
      isDefault: Boolean(connection.is_default),
      createdAt: connection.created_at,
      updatedAt: connection.updated_at,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertWechatConnectionQuota(session.userId);
    const token = await verifyWechatCredential(body.appId, body.appSecret);
    const encrypted = encryptWechatConnection({
      appId: body.appId,
      appSecret: body.appSecret,
      accessToken: token.access_token,
    });
    await upsertWechatConnection({
      userId: session.userId,
      accountName: body.accountName,
      originalId: body.originalId,
      appIdEncrypted: encrypted.appIdEncrypted,
      appSecretEncrypted: encrypted.appSecretEncrypted,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      status: "valid",
      isDefault: body.isDefault ?? true,
    });
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "公众号连接失败", 400);
  }
}
