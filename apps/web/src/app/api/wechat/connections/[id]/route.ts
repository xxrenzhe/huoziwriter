import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { disableWechatConnection, upsertWechatConnection } from "@/lib/repositories";
import { encryptWechatConnection, verifyWechatCredential } from "@/lib/wechat";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const token = await verifyWechatCredential(body.appId, body.appSecret);
    const encrypted = encryptWechatConnection({
      appId: body.appId,
      appSecret: body.appSecret,
      accessToken: token.access_token,
    });
    await upsertWechatConnection({
      userId: session.userId,
      connectionId: Number(params.id),
      accountName: body.accountName,
      originalId: body.originalId,
      appIdEncrypted: encrypted.appIdEncrypted,
      appSecretEncrypted: encrypted.appSecretEncrypted,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      status: "valid",
      isDefault: body.isDefault ?? false,
    });
    return ok({ updated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新公众号连接失败", 400);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await disableWechatConnection(Number(params.id), session.userId);
  return ok({ deleted: true, status: "disabled" });
}
