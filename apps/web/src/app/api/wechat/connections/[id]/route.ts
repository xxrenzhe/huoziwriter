import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertWechatPublishAllowed } from "@/lib/plan-access";
import { disableWechatConnection, getWechatConnectionRaw, upsertWechatConnection } from "@/lib/repositories";
import { encryptWechatConnection, verifyWechatCredential } from "@/lib/wechat";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertWechatPublishAllowed(session.userId);
    const connectionId = Number(params.id);
    const existing = await getWechatConnectionRaw(connectionId, session.userId);
    if (!existing) {
      return fail("公众号连接不存在", 404);
    }

    const hasAppId = typeof body.appId === "string" && body.appId.trim().length > 0;
    const hasAppSecret = typeof body.appSecret === "string" && body.appSecret.trim().length > 0;
    if (hasAppId !== hasAppSecret) {
      return fail("更新凭证时必须同时提供 AppID 和 AppSecret", 400);
    }

    if (hasAppId && hasAppSecret) {
      const token = await verifyWechatCredential(body.appId, body.appSecret);
      const encrypted = encryptWechatConnection({
        appId: body.appId,
        appSecret: body.appSecret,
        accessToken: token.access_token,
      });
      await upsertWechatConnection({
        userId: session.userId,
        connectionId,
        accountName: body.accountName ?? existing.account_name,
        originalId: body.originalId ?? existing.original_id,
        appIdEncrypted: encrypted.appIdEncrypted,
        appSecretEncrypted: encrypted.appSecretEncrypted,
        accessTokenEncrypted: encrypted.accessTokenEncrypted,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        status: "valid",
        isDefault: body.isDefault ?? Boolean(existing.is_default),
      });
      return ok({ updated: true, reverified: true });
    }

    await upsertWechatConnection({
      userId: session.userId,
      connectionId,
      accountName: body.accountName ?? existing.account_name,
      originalId: body.originalId ?? existing.original_id,
      appIdEncrypted: existing.app_id_encrypted,
      appSecretEncrypted: existing.app_secret_encrypted,
      accessTokenEncrypted: existing.access_token_encrypted,
      accessTokenExpiresAt: existing.access_token_expires_at,
      status: existing.status,
      isDefault: body.isDefault ?? Boolean(existing.is_default),
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
