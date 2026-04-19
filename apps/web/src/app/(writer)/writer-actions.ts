"use server";

import { revalidatePath } from "next/cache";

import { ensureUserSession } from "@/lib/auth";
import { syncArticleCoverAssetToAssetFiles } from "@/lib/asset-files";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { persistArticleCoverImageAssetSet } from "@/lib/image-assets";
import { generateCoverImageCandidates } from "@/lib/image-generation";
import { getKnowledgeCardDetail, rebuildKnowledgeCard } from "@/lib/knowledge";
import {
  assertCoverImageAllowed,
  assertCoverImageQuota,
  assertCoverImageReferenceAllowed,
  assertImageAssetStorageAvailable,
  assertTopicSourceManageAllowed,
  assertWechatConnectionQuota,
  assertWechatPublishAllowed,
  consumeCoverImageQuota,
  getCoverImageGenerationStorageReserveBytes,
  getImageAssetStorageQuotaStatus,
} from "@/lib/plan-access";
import {
  disableWechatConnection,
  getWechatConnectionRaw,
  getWechatConnections,
  getWechatSyncLogs,
  upsertWechatConnection,
} from "@/lib/repositories";
import { ensureExtendedProductSchema } from "@/lib/schema-bootstrap";
import { createTopicSource, disableTopicSource, updateTopicSource } from "@/lib/topic-signals";
import { encryptWechatConnection, verifyWechatCredential } from "@/lib/wechat";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";

function requireSession(session: Awaited<ReturnType<typeof ensureUserSession>>) {
  if (!session) {
    throw new Error("未登录");
  }
  return session;
}

function mapWechatConnection(connection: Awaited<ReturnType<typeof getWechatConnections>>[number]) {
  return {
    id: connection.id,
    accountName: connection.account_name,
    originalId: connection.original_id,
    status: connection.status,
    accessTokenExpiresAt: connection.access_token_expires_at,
    isDefault: Boolean(connection.is_default),
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
  };
}

function revalidateWriterSurface(articleId?: number | null) {
  revalidatePath("/settings");
  revalidatePath("/warroom");
  revalidatePath("/articles");
  if (articleId) {
    revalidatePath(`/articles/${articleId}`);
  }
}

export async function createTopicSourceAction(input: {
  name?: string;
  homepageUrl?: string;
  sourceType?: string;
  priority?: number;
}) {
  const session = requireSession(await ensureUserSession());
  await assertTopicSourceManageAllowed(session.userId);
  if (!input.name?.trim() || !input.homepageUrl?.trim()) {
    throw new Error("名称和主页地址不能为空");
  }
  await createTopicSource({
    userId: session.userId,
    name: input.name,
    homepageUrl: input.homepageUrl,
    sourceType: input.sourceType ? String(input.sourceType) : undefined,
    priority: input.priority,
  });
  revalidateWriterSurface();
  return { created: true };
}

export async function updateTopicSourceAction(
  sourceId: number,
  payload: { sourceType?: string; priority?: number },
) {
  const session = requireSession(await ensureUserSession());
  await assertTopicSourceManageAllowed(session.userId);
  await updateTopicSource({
    userId: session.userId,
    sourceId,
    sourceType: payload.sourceType === undefined ? undefined : String(payload.sourceType),
    priority: payload.priority,
  });
  revalidateWriterSurface();
  return { updated: true };
}

export async function disableTopicSourceAction(sourceId: number) {
  const session = requireSession(await ensureUserSession());
  await assertTopicSourceManageAllowed(session.userId);
  await disableTopicSource({
    userId: session.userId,
    sourceId,
  });
  revalidateWriterSurface();
  return { deleted: true };
}

export async function refreshKnowledgeCardAction(cardId: number) {
  const session = requireSession(await ensureUserSession());
  const existing = await getKnowledgeCardDetail(session.userId, cardId);
  if (!existing) {
    throw new Error("背景卡不存在");
  }
  await rebuildKnowledgeCard(cardId);
  const card = await getKnowledgeCardDetail(session.userId, cardId);
  if (!card) {
    throw new Error("背景卡刷新失败");
  }
  await appendAuditLog({
    userId: session.userId,
    action: "knowledge.refresh",
    targetType: "knowledge_card",
    targetId: String(cardId),
  });
  revalidateWriterSurface();
  return card;
}

export async function listWechatConnectionsAction() {
  const session = requireSession(await ensureUserSession());
  const connections = await getWechatConnections(session.userId);
  return connections.map(mapWechatConnection);
}

export async function upsertWechatConnectionAction(input: {
  connectionId?: number | null;
  accountName?: string;
  originalId?: string;
  appId?: string;
  appSecret?: string;
  isDefault?: boolean;
}) {
  const session = requireSession(await ensureUserSession());
  const connectionId = input.connectionId ? Number(input.connectionId) : null;
  if (!connectionId) {
    const appId = String(input.appId || "").trim();
    const appSecret = String(input.appSecret || "").trim();
    if (!appId || !appSecret) {
      throw new Error("新增公众号连接时必须提供 AppID 和 AppSecret");
    }
    await assertWechatConnectionQuota(session.userId);
    const token = await verifyWechatCredential(appId, appSecret);
    const encrypted = encryptWechatConnection({
      appId,
      appSecret,
      accessToken: token.access_token,
    });
    await upsertWechatConnection({
      userId: session.userId,
      accountName: input.accountName,
      originalId: input.originalId,
      appIdEncrypted: encrypted.appIdEncrypted,
      appSecretEncrypted: encrypted.appSecretEncrypted,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      status: "valid",
      isDefault: input.isDefault ?? true,
    });
    revalidateWriterSurface();
    return listWechatConnectionsAction();
  }

  await assertWechatPublishAllowed(session.userId);
  const existing = await getWechatConnectionRaw(connectionId, session.userId);
  if (!existing) {
    throw new Error("公众号连接不存在");
  }

  const hasAppId = typeof input.appId === "string" && input.appId.trim().length > 0;
  const hasAppSecret = typeof input.appSecret === "string" && input.appSecret.trim().length > 0;
  if (hasAppId !== hasAppSecret) {
    throw new Error("更新凭证时必须同时提供 AppID 和 AppSecret");
  }

  if (hasAppId && hasAppSecret) {
    const appId = String(input.appId || "").trim();
    const appSecret = String(input.appSecret || "").trim();
    const token = await verifyWechatCredential(appId, appSecret);
    const encrypted = encryptWechatConnection({
      appId,
      appSecret,
      accessToken: token.access_token,
    });
    await upsertWechatConnection({
      userId: session.userId,
      connectionId,
      accountName: input.accountName ?? existing.account_name,
      originalId: input.originalId ?? existing.original_id,
      appIdEncrypted: encrypted.appIdEncrypted,
      appSecretEncrypted: encrypted.appSecretEncrypted,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      status: "valid",
      isDefault: input.isDefault ?? Boolean(existing.is_default),
    });
  } else {
    await upsertWechatConnection({
      userId: session.userId,
      connectionId,
      accountName: input.accountName ?? existing.account_name,
      originalId: input.originalId ?? existing.original_id,
      appIdEncrypted: existing.app_id_encrypted,
      appSecretEncrypted: existing.app_secret_encrypted,
      accessTokenEncrypted: existing.access_token_encrypted,
      accessTokenExpiresAt: existing.access_token_expires_at,
      status: existing.status,
      isDefault: input.isDefault ?? Boolean(existing.is_default),
    });
  }

  revalidateWriterSurface();
  return listWechatConnectionsAction();
}

export async function disableWechatConnectionAction(connectionId: number) {
  const session = requireSession(await ensureUserSession());
  await disableWechatConnection(connectionId, session.userId);
  revalidateWriterSurface();
  return listWechatConnectionsAction();
}

export async function listWechatSyncLogsAction(articleId?: number | null) {
  const session = requireSession(await ensureUserSession());
  const logs = await getWechatSyncLogs(session.userId);
  return articleId ? logs.filter((item) => item.articleId === articleId) : logs;
}

export async function generateCoverImageAction(input: {
  articleId?: number | null;
  title?: string;
  referenceImageDataUrl?: string | null;
}) {
  const session = requireSession(await ensureUserSession());
  await ensureExtendedProductSchema();
  await assertCoverImageAllowed(session.userId);
  await assertCoverImageQuota(session.userId);
  await assertImageAssetStorageAvailable(session.userId, {
    reserveBytes: getCoverImageGenerationStorageReserveBytes(),
  });
  const targetArticleId = input.articleId == null ? null : Number(input.articleId);
  const referenceImageDataUrl =
    typeof input.referenceImageDataUrl === "string" && input.referenceImageDataUrl.startsWith("data:image/")
      ? input.referenceImageDataUrl
      : null;
  if (input.referenceImageDataUrl && !referenceImageDataUrl) {
    throw new Error("参考图格式不合法，必须是 data:image/* 数据");
  }
  if (referenceImageDataUrl) {
    await assertCoverImageReferenceAllowed(session.userId);
  }
  const authoringContext = await getArticleAuthoringStyleContext(
    session.userId,
    targetArticleId && Number.isFinite(targetArticleId) ? targetArticleId : undefined,
  );
  const candidates = await generateCoverImageCandidates({
    title: input.title || "Huozi Writer",
    referenceImageDataUrl,
    authoringContext,
  });
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const batchToken = `cover-${session.userId}-${Date.now()}`;
  for (const candidate of candidates) {
    const storedAsset = await persistArticleCoverImageAssetSet({
      userId: session.userId,
      articleId: targetArticleId ?? null,
      batchToken,
      variantLabel: candidate.variantLabel,
      source: candidate.imageUrl,
    });
    const result = await db.exec(
      `INSERT INTO cover_image_candidates (
        user_id, article_id, batch_token, variant_label, prompt, image_url,
        storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json,
        is_selected, created_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        targetArticleId ?? null,
        batchToken,
        candidate.variantLabel,
        candidate.prompt,
        storedAsset.imageUrl,
        storedAsset.storageProvider,
        storedAsset.originalObjectKey,
        storedAsset.compressedObjectKey,
        storedAsset.thumbnailObjectKey,
        JSON.stringify(storedAsset.assetManifest),
        false,
        createdAt,
      ],
    );
    await syncArticleCoverAssetToAssetFiles({
      assetScope: "candidate",
      sourceRecordId: Number(result.lastInsertRowid || 0),
      userId: session.userId,
      articleId: targetArticleId ?? null,
      batchToken,
      variantLabel: candidate.variantLabel,
      imageUrl: storedAsset.imageUrl,
      storageProvider: storedAsset.storageProvider,
      originalObjectKey: storedAsset.originalObjectKey,
      compressedObjectKey: storedAsset.compressedObjectKey,
      thumbnailObjectKey: storedAsset.thumbnailObjectKey,
      assetManifestJson: storedAsset.assetManifest,
      createdAt,
    });
  }
  const savedCandidates = await db.query<{
    id: number;
    variant_label: string;
    prompt: string;
    image_url: string;
    asset_file_id: number | null;
  }>(
    targetArticleId == null
      ? `SELECT cic.id, cic.variant_label, cic.prompt, cic.image_url, af.id as asset_file_id
         FROM cover_image_candidates cic
         LEFT JOIN asset_files af ON af.asset_scope = ? AND af.source_record_id = cic.id
         WHERE cic.user_id = ? AND cic.article_id IS NULL AND cic.batch_token = ?
         ORDER BY cic.id ASC`
      : `SELECT cic.id, cic.variant_label, cic.prompt, cic.image_url, af.id as asset_file_id
         FROM cover_image_candidates cic
         LEFT JOIN asset_files af ON af.asset_scope = ? AND af.source_record_id = cic.id
         WHERE cic.user_id = ? AND cic.article_id = ? AND cic.batch_token = ?
         ORDER BY cic.id ASC`,
    targetArticleId == null ? ["candidate", session.userId, batchToken] : ["candidate", session.userId, targetArticleId, batchToken],
  );
  const quota = await consumeCoverImageQuota(session.userId);
  const storageQuota = await getImageAssetStorageQuotaStatus(session.userId);
  await appendAuditLog({
    userId: session.userId,
    action: "cover_image.generate",
    targetType: "article",
    targetId: targetArticleId ?? null,
    payload: {
      title: input.title,
      model: candidates[0]?.model,
      endpoint: candidates[0]?.endpoint,
      usedReferenceImage: Boolean(referenceImageDataUrl),
      candidateCount: candidates.length,
    },
  });
  revalidateWriterSurface(targetArticleId);
  return {
    batchToken,
    candidates: savedCandidates.map((candidate) => ({
      id: candidate.id,
      variantLabel: candidate.variant_label,
      imageUrl: candidate.image_url,
      prompt: candidate.prompt,
      assetFileId: candidate.asset_file_id,
    })),
    createdAt,
    model: candidates[0]?.model,
    providerName: candidates[0]?.providerName,
    endpoint: candidates[0]?.endpoint,
    quota,
    storageQuota,
  };
}

export async function selectCoverCandidateAction(candidateId: number) {
  const session = requireSession(await ensureUserSession());
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidate = await db.queryOne<{
    id: number;
    user_id: number;
    article_id: number | null;
    batch_token: string;
    variant_label: string;
    prompt: string;
    image_url: string;
    storage_provider: string | null;
    original_object_key: string | null;
    compressed_object_key: string | null;
    thumbnail_object_key: string | null;
    asset_manifest_json: string | null;
  }>(
    `SELECT id, user_id, article_id AS article_id, batch_token, variant_label, prompt, image_url,
            storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json
     FROM cover_image_candidates
     WHERE id = ? AND user_id = ?`,
    [candidateId, session.userId],
  );
  if (!candidate) {
    throw new Error("封面图候选不存在");
  }

  const createdAt = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO cover_images (
      user_id, article_id, prompt, image_url, storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.userId,
      candidate.article_id,
      candidate.prompt,
      candidate.image_url,
      candidate.storage_provider,
      candidate.original_object_key,
      candidate.compressed_object_key,
      candidate.thumbnail_object_key,
      candidate.asset_manifest_json,
      createdAt,
    ],
  );
  const assetFileId = await syncArticleCoverAssetToAssetFiles({
    assetScope: "cover",
    sourceRecordId: Number(result.lastInsertRowid || 0),
    userId: session.userId,
    articleId: candidate.article_id,
    batchToken: candidate.batch_token,
    variantLabel: candidate.variant_label,
    imageUrl: candidate.image_url,
    storageProvider: candidate.storage_provider,
    originalObjectKey: candidate.original_object_key,
    compressedObjectKey: candidate.compressed_object_key,
    thumbnailObjectKey: candidate.thumbnail_object_key,
    assetManifestJson: candidate.asset_manifest_json,
    createdAt,
  });
  await db.exec(
    `UPDATE cover_image_candidates
     SET is_selected = ?, selected_at = ?
     WHERE batch_token = ? AND user_id = ?`,
    [false, null, candidate.batch_token, session.userId],
  );
  await db.exec(
    `UPDATE cover_image_candidates
     SET is_selected = ?, selected_at = ?
     WHERE id = ? AND user_id = ?`,
    [true, createdAt, candidate.id, session.userId],
  );

  await appendAuditLog({
    userId: session.userId,
    action: "cover_image.select",
    targetType: "article",
    targetId: candidate.article_id,
    payload: { candidateId: candidate.id, batchToken: candidate.batch_token, variantLabel: candidate.variant_label },
  });
  revalidateWriterSurface(candidate.article_id);
  return {
    id: candidate.id,
    articleId: candidate.article_id,
    imageUrl: candidate.image_url,
    prompt: candidate.prompt,
    variantLabel: candidate.variant_label,
    assetFileId,
    createdAt,
  };
}
