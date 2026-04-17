import path from "node:path";
import { expect, test } from "@playwright/test";
import { appendAuditLog } from "../../apps/web/src/lib/audit";
import { syncArticleCoverAssetToAssetFiles } from "../../apps/web/src/lib/asset-files";
import { getDatabase } from "../../apps/web/src/lib/db";
import { distillCaptureInput } from "../../apps/web/src/lib/distill";
import { persistArticleCoverImageAssetSet } from "../../apps/web/src/lib/image-assets";
import { generateCoverImageCandidates } from "../../apps/web/src/lib/image-generation";
import { compileKnowledgeCardFromFragments, getKnowledgeCards } from "../../apps/web/src/lib/knowledge";
import { assertFragmentQuota, getImageAssetStorageQuotaStatus } from "../../apps/web/src/lib/plan-access";
import { evaluateArticlePublishGuard } from "../../apps/web/src/lib/publish-guard";
import { createFragment, getWechatConnections, queueJob, upsertWechatConnection } from "../../apps/web/src/lib/repositories";
import { ensureExtendedProductSchema } from "../../apps/web/src/lib/schema-bootstrap";
import { encryptWechatConnection } from "../../apps/web/src/lib/wechat";
import { getArticleAuthoringStyleContext } from "../../apps/web/src/lib/article-authoring-style-context";

process.env.DATABASE_PATH ||= path.resolve(process.cwd(), "apps/web/data/e2e-huoziwriter.db");

async function loginAsOps(baseURL: string, request: import("@playwright/test").APIRequestContext) {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      username: "huozi",
      password: "REDACTED_ADMIN_PASSWORD",
    },
  });
  expect(response.ok()).toBeTruthy();
  const setCookie = response.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  return String(setCookie).split(";")[0];
}

async function loginWithPassword(baseURL: string, request: import("@playwright/test").APIRequestContext, input: {
  username: string;
  password: string;
}) {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: input,
  });
  expect(response.ok()).toBeTruthy();
  const setCookie = response.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  return String(setCookie).split(";")[0];
}

async function seedPageSession(page: import("@playwright/test").Page, baseURL: string, cookie: string) {
  const [name, ...rest] = cookie.split("=");
  await page.context().addCookies([
    {
      name,
      value: rest.join("="),
      url: baseURL,
    },
  ]);
}

async function getCurrentUserId(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const response = await request.get(`${baseURL}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  return Number(json.data.id);
}

function parseStringList(value: string | string[] | null | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

async function createManualFragmentForTest(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  input: {
    title: string;
    content: string;
  },
) {
  const userId = await getCurrentUserId(baseURL, request, cookie);
  await assertFragmentQuota(userId);
  const distilled = await distillCaptureInput({
    sourceType: "manual",
    title: input.title || "手动素材",
    content: input.content,
  });
  const fragment = await createFragment({
    userId,
    sourceType: "manual",
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
  });
  expect(Number(fragment?.id || 0)).toBeGreaterThan(0);
  await queueJob("capture", { fragmentId: fragment?.id, sourceType: "manual" });
  return fragment;
}

async function compileKnowledgeCardForTest(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
) {
  const userId = await getCurrentUserId(baseURL, request, cookie);
  const card = await compileKnowledgeCardFromFragments(userId);
  expect(Number(card?.id || 0)).toBeGreaterThan(0);
  await appendAuditLog({
    userId,
    action: "knowledge.compile",
    targetType: "knowledge_card",
    targetId: card?.id,
  });
  return card;
}

async function listKnowledgeCardsForTest(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
) {
  const userId = await getCurrentUserId(baseURL, request, cookie);
  const cards = await getKnowledgeCards(userId);
  return cards.map((card) => ({
    id: card.id,
    cardType: card.card_type,
    title: card.title,
    slug: card.slug,
    summary: card.summary,
    conflictFlags: parseStringList(card.conflict_flags_json),
    latestChangeSummary: card.latest_change_summary,
    overturnedJudgements: parseStringList(card.overturned_judgements_json),
    sourceFragmentIds: card.source_fragment_ids,
    confidenceScore: card.confidence_score,
    status: card.status,
    lastCompiledAt: card.last_compiled_at,
    lastVerifiedAt: card.last_verified_at,
    sourceFragmentCount: card.source_fragment_count,
    createdAt: card.created_at,
  }));
}

async function createE2EUser(baseURL: string, request: import("@playwright/test").APIRequestContext, opsCookie: string, input?: {
  planCode?: "free" | "pro" | "ultra";
}) {
  const username = `e2e_user_${Date.now()}`;
  const password = "REDACTED_ADMIN_PASSWORD";
  const response = await request.post(`${baseURL}/api/ops/users`, {
    headers: { Cookie: opsCookie },
    data: {
      username,
      password,
      role: "user",
      planCode: input?.planCode || "free",
      mustChangePassword: false,
    },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  return {
    id: Number(json.data.id),
    username,
    password,
  };
}

async function ensurePersona(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const listed = await request.get(`${baseURL}/api/personas`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  expect(Array.isArray(listedJson.data.catalog?.identity)).toBeTruthy();
  expect(Array.isArray(listedJson.data.catalog?.writingStyle)).toBeTruthy();
  const personas = Array.isArray(listedJson.data.personas) ? listedJson.data.personas : [];
  const defaultPersona = personas.find((item: { isDefault?: boolean }) => Boolean(item.isDefault));
  if (defaultPersona) {
    return defaultPersona;
  }
  if (personas.length > 0) {
    const promoted = await request.patch(`${baseURL}/api/personas/${personas[0].id}`, {
      headers: { Cookie: cookie },
      data: {
        isDefault: true,
      },
    });
    expect(promoted.ok()).toBeTruthy();
    const promotedJson = await promoted.json();
    return promotedJson.data;
  }

  const created = await request.post(`${baseURL}/api/personas`, {
    headers: { Cookie: cookie },
    data: {
      name: `E2E 作者人设 ${Date.now()}`,
      identityTags: ["AI 产品经理"],
      writingStyleTags: ["经验分享"],
      isDefault: true,
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  expect(Array.isArray(createdJson.data.identityTags)).toBeTruthy();
  expect(Array.isArray(createdJson.data.writingStyleTags)).toBeTruthy();
  return createdJson.data;
}

async function createWritingStyleProfileForTest(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  input?: {
    name?: string;
  },
) {
  const response = await request.post(`${baseURL}/api/writing-style-profiles`, {
    headers: { Cookie: cookie },
    data: {
      name: input?.name || `E2E 文风资产 ${Date.now()}`,
      analysis: {
        sourceUrl: "https://example.com/e2e-style-profile",
        sourceTitle: "E2E 风格样本",
        styleName: "E2E 状态驱动文风",
        summary: "判断先行，段落有呼吸，正文会保留短暂偏题后再拉回主线。",
        toneKeywords: ["判断先行", "短句推进", "带点现场感"],
        sentenceRhythm: "短句为主，关键判断会单独拎出来。",
        sentenceLengthProfile: "短句和长句混排，关键句要明显收短。",
        paragraphBreathingPattern: "每隔一两段要有一句话独段，别把所有段落写成同样长度。",
        structurePatterns: ["先场景后判断", "中途允许偏题一下再拉回", "结尾停在动作上"],
        transitionPatterns: ["说回开头", "但问题是", "再往下看"],
        languageHabits: ["会直接下判断", "带一点口语提醒", "解释时不爱编号"],
        openingPatterns: ["从现场切入", "从刚想明白的冲突切入"],
        endingPatterns: ["停在动作上", "回扣开头后收住"],
        factDensity: "高，每个判断后都要跟一个事实锚点。",
        emotionalIntensity: "中高，带一点作者火气。",
        suitableTopics: ["产品复盘", "工作流拆解", "内容策略"],
        reusablePromptFragments: [
          "先把场景摊开，再亮判断。",
          "关键句单独成段，别挤在解释里。",
        ],
        doNotWrite: ["不要写成编号提纲", "不要总结式升华"],
        verbatimPhraseBanks: {
          transitionPhrases: ["说回开头", "但问题是", "再往下看"],
          judgementPhrases: ["说白了", "我更在意的是"],
          selfDisclosurePhrases: ["这事我也踩过坑", "我一开始也误判过"],
          emotionPhrases: ["说实话有点上头", "真会让人皱眉"],
          readerBridgePhrases: ["你会发现", "你如果也在做这件事"],
        },
        punctuationHabits: ["逗号推进", "偶尔用问句打断", "减少预告式冒号"],
        tangentPatterns: ["中间允许岔出去补一个吐槽，再立刻拉回判断"],
        callbackPatterns: ["说回开头", "前面那个问题，到这里才算解释清楚"],
        tabooPatterns: ["预告式起手", "对称三段论", "教科书式总结"],
        statePresets: ["像刚研究明白一件事，急着跟熟人讲清楚", "说到关键处会明显加速"],
        antiOutlineRules: ["不要先讲背景再讲结论", "不要所有段落都用同样句法推进"],
        imitationPrompt: "像刚把一件事研究透，带着判断和火气讲给熟人听，少给施工图，多按状态推进。",
        sourceExcerpt: "先把场景摊开，再亮判断。关键句单独成段，别挤在解释里。",
        model: "e2e-style-profile",
        provider: "test",
        degradedReason: null,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(Number(json.data?.id || 0)).toBeGreaterThan(0);
  return Number(json.data.id);
}

async function ensureSeries(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  persona?: { id: number },
) {
  const boundPersona = persona ?? (await ensurePersona(baseURL, request, cookie));
  const listed = await request.get(`${baseURL}/api/series`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  const series = Array.isArray(listedJson.data.series) ? listedJson.data.series : [];
  const existing = series.find((item: { activeStatus?: string }) => String(item.activeStatus || "") === "active") ?? series[0];
  if (existing) {
    return existing;
  }

  const created = await request.post(`${baseURL}/api/series`, {
    headers: { Cookie: cookie },
    data: {
      name: `E2E 内容系列 ${Date.now()}`,
      personaId: boundPersona.id,
      thesis: "围绕内容生产工作流的结构变化持续输出判断。",
      targetAudience: "关心内容生产效率和写作系统的产品、运营与创作者。",
      activeStatus: "active",
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  return createdJson.data;
}

async function createArticleForTest(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  input?: {
    title?: string;
  },
) {
  const series = await ensureSeries(baseURL, request, cookie);
  const created = await request.post(`${baseURL}/api/articles`, {
    headers: { Cookie: cookie },
    data: {
      title: input?.title || `E2E 稿件 ${Date.now()}`,
      seriesId: series.id,
    },
  });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const articleId = Number(createdJson.data.id);
  expect(articleId).toBeGreaterThan(0);
  return {
    articleId,
    createdJson,
    series,
  };
}

async function ensureMockImageEngine(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const response = await request.put(`${baseURL}/api/ops/image-engine`, {
    headers: { Cookie: cookie },
    data: {
      baseUrl: `${baseURL}/api/tools/mock-image-engine`,
      model: "mock-cover-v1",
      apiKey: "mock-local-api-key",
      isEnabled: true,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function ensureMockWechatConnection(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const matchesMockConnection = (item: {
    accountName?: string | null;
    originalId?: string | null;
    account_name?: string | null;
    original_id?: string | null;
  }) =>
    item.accountName === "Mock 微信公众号" ||
    item.originalId === "gh_mock_wechat" ||
    item.account_name === "Mock 微信公众号" ||
    item.original_id === "gh_mock_wechat";

  const userId = await getCurrentUserId(baseURL, request, cookie);
  const existingConnections = await getWechatConnections(userId);
  const existing = existingConnections.find(matchesMockConnection);
  if (existing) {
    return {
      id: existing.id,
      accountName: existing.account_name ?? null,
      originalId: existing.original_id ?? null,
      status: existing.status,
      isDefault: Boolean(existing.is_default),
    };
  }

  const encrypted = encryptWechatConnection({
    appId: "mock_app_id",
    appSecret: "mock_app_secret",
    accessToken: "mock_access_token_app_id",
  });
  await upsertWechatConnection({
    userId,
    accountName: "Mock 微信公众号",
    originalId: "gh_mock_wechat",
    appIdEncrypted: encrypted.appIdEncrypted,
    appSecretEncrypted: encrypted.appSecretEncrypted,
    accessTokenEncrypted: encrypted.accessTokenEncrypted,
    accessTokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: "valid",
    isDefault: true,
  });
  const reloaded = await getWechatConnections(userId);
  const connection = reloaded.find(matchesMockConnection);
  expect(connection).toBeTruthy();
  return {
    id: Number(connection?.id || 0),
    accountName: connection?.account_name ?? null,
    originalId: connection?.original_id ?? null,
    status: connection?.status || "unknown",
    isDefault: Boolean(connection?.is_default),
  };
}

async function generateCoverCandidatesForTest(input: {
  userId: number;
  articleId: number;
  title: string;
}) {
  await ensureExtendedProductSchema();
  const authoringContext = await getArticleAuthoringStyleContext(input.userId, input.articleId);
  const generated = await generateCoverImageCandidates({
    title: input.title,
    authoringContext,
  });
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const batchToken = `cover-${input.userId}-${Date.now()}`;
  for (const candidate of generated) {
    const storedAsset = await persistArticleCoverImageAssetSet({
      userId: input.userId,
      articleId: input.articleId,
      batchToken,
      variantLabel: candidate.variantLabel,
      source: candidate.imageUrl,
    });
    const result = await db.exec(
      `INSERT INTO cover_image_candidates (
        user_id, document_id, batch_token, variant_label, prompt, image_url,
        storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json,
        is_selected, created_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.articleId,
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
      userId: input.userId,
      articleId: input.articleId,
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
  const candidates = await db.query<{
    id: number;
    variant_label: string;
    prompt: string;
    image_url: string;
    asset_file_id: number | null;
  }>(
    `SELECT cic.id, cic.variant_label, cic.prompt, cic.image_url, af.id as asset_file_id
     FROM cover_image_candidates cic
     LEFT JOIN asset_files af ON af.asset_scope = ? AND af.source_record_id = cic.id
     WHERE cic.user_id = ? AND cic.document_id = ? AND cic.batch_token = ?
     ORDER BY cic.id ASC`,
    ["candidate", input.userId, input.articleId, batchToken],
  );
  return {
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      variantLabel: candidate.variant_label,
      imageUrl: candidate.image_url,
      prompt: candidate.prompt,
      assetFileId: candidate.asset_file_id,
    })),
    storageQuota: await getImageAssetStorageQuotaStatus(input.userId),
  };
}

async function selectCoverCandidateForTest(input: {
  userId: number;
  candidateId: number;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidate = await db.queryOne<{
    id: number;
    user_id: number;
    document_id: number | null;
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
    `SELECT id, user_id, document_id, batch_token, variant_label, prompt, image_url,
            storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json
     FROM cover_image_candidates
     WHERE id = ? AND user_id = ?`,
    [input.candidateId, input.userId],
  );
  expect(candidate).toBeTruthy();
  if (!candidate) {
    throw new Error("封面图候选不存在");
  }

  const createdAt = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO cover_images (
      user_id, document_id, prompt, image_url, storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      candidate.document_id,
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
    userId: input.userId,
    articleId: candidate.document_id,
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
    [false, null, candidate.batch_token, input.userId],
  );
  await db.exec(
    `UPDATE cover_image_candidates
     SET is_selected = ?, selected_at = ?
     WHERE id = ? AND user_id = ?`,
    [true, createdAt, candidate.id, input.userId],
  );
  return {
    id: candidate.id,
    articleId: candidate.document_id,
    imageUrl: candidate.image_url,
    prompt: candidate.prompt,
    variantLabel: candidate.variant_label,
    assetFileId,
    createdAt,
  };
}

async function createPublishReadyArticle(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string, input?: {
  title?: string;
}) {
  await ensurePersona(baseURL, request, cookie);

  const { articleId } = await createArticleForTest(baseURL, request, cookie, {
    title: input?.title || `E2E Mock 微信发布稿件 ${Date.now()}`,
  });

  const selectedTitle = input?.title || "E2E Mock 微信发布稿件";

  const savedDocument = await request.put(`${baseURL}/api/articles/${articleId}/draft`, {
    headers: { Cookie: cookie },
    data: {
      title: selectedTitle,
      markdownContent: [
        `# ${selectedTitle}`,
        "",
        "周二晚上十点，编辑把稿子丢回来了。",
        "",
        "她只说了一句：内容能发，但草稿箱这一步又卡住了。",
        "",
        "问题不在不会写。问题在最后一公里总有人补锅。",
        "",
        "如果事实核查没有前置，公众号写作会在最后一公里持续返工；如果封面和草稿箱发布没有接上，团队就很难稳定复用整套内容生产流程。",
        "",
        "说回开头，那句“又卡住了”其实不是情绪词，它暴露的是流程里一直没人提前把发布条件收紧。",
        "",
        "所以这篇稿子最后要落到动作上：先把核查、封面、连接和发布守门压到同一条链路里，再点发布。",
      ].join("\n"),
      status: "ready",
    },
  });
  expect(savedDocument.ok()).toBeTruthy();

  const outlineSeed = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "发布链路大纲已确认。",
        workingTitle: selectedTitle,
        outlineSections: [
          { heading: "问题背景", goal: "说明为什么发布返工频繁", keyPoints: ["核查缺位会导致返工"], evidenceHints: ["来自正文"], transition: "从问题进入方法" },
          { heading: "解决路径", goal: "说明如何把守门前置", keyPoints: ["核查、润色、封面、发布串起来"], evidenceHints: ["来自正文"], transition: "从方法进入结果" },
        ],
        selection: {
          selectedTitle,
          selectedOpeningHook: "先抛结论再解释成本。",
          selectedTargetEmotion: "建立确定感。",
          selectedEndingStrategy: "结尾落到发布动作。",
        },
      },
    },
  });
  expect(outlineSeed.ok()).toBeTruthy();

  const deepWritingSeed = await request.patch(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "深度写作执行卡已确认。",
        selectedTitle,
        articlePrototype: "scene_to_judgement",
        articlePrototypeLabel: "场景切入后立刻下判断",
        articlePrototypeReason: "这类发布返工题更适合先给现场，再抽出真正的问题。",
        stateVariantCode: "friend_share",
        stateVariantLabel: "像刚复盘明白，转头讲给同事听",
        stateVariantReason: "正文需要保留现场感和一点作者火气，不能写成说明书。",
        openingPatternLabel: "场景切入",
        syntaxPatternLabel: "短长句交替",
        endingPatternLabel: "动作收束",
        progressiveRevealEnabled: false,
        stateChecklist: [
          "开头先摆现场，再下判断，别直接写结论摘要。",
          "关键判断单独成段，别挤在解释里。",
          "中间至少回扣一次开头那句“又卡住了”。",
          "结尾停在动作，不做总结升华。",
        ],
        mustUseFacts: [
          "返工最常发生在草稿箱前的最后一公里。",
          "核查、封面、连接和发布守门必须一起前置。",
          "只要发布条件没提前收紧，团队就会反复补锅。",
        ],
        sectionBlueprint: [
          {
            heading: "卡住的那一刻",
            goal: "先把返工现场摆出来",
            paragraphMission: "从编辑退稿那句话切入，先让读者看到问题在哪",
            evidenceHints: ["编辑只说了一句：内容能发，但草稿箱这一步又卡住了。"],
            revealRole: "铺垫样本",
            transition: "从现场切到真正的结构性问题",
          },
          {
            heading: "真正拖慢交付的不是写作",
            goal: "把返工根因说透",
            paragraphMission: "解释为什么问题总是在发布前集中爆发",
            evidenceHints: ["返工最常发生在草稿箱前的最后一公里。", "只要发布条件没提前收紧，团队就会反复补锅。"],
            revealRole: "加码判断",
            transition: "从根因推到解决动作",
          },
          {
            heading: "把守门前置到同一条链路",
            goal: "给出能执行的收束动作",
            paragraphMission: "收紧核查、封面、连接和发布动作，让稿件直接进入可发状态",
            evidenceHints: ["核查、封面、连接和发布守门必须一起前置。"],
            revealRole: "收束动作",
            transition: "说完就收住",
          },
        ],
        voiceChecklist: ["判断先行", "少讲套话", "句子尽量收短"],
        finalChecklist: ["不要超出事实边界", "结尾给出动作"],
      },
    },
  });
  expect(deepWritingSeed.ok()).toBeTruthy();

  const factCheckSaved = await request.patch(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "发布前核查已收敛。",
        overallRisk: "low",
        checks: [
          {
            claim: "内容团队开始把核查、润色、封面和发布守门合并成一条稳定链路。",
            status: "verified",
            suggestion: "保留。",
          },
        ],
        evidenceCards: [],
        missingEvidence: [],
        personaAlignment: "当前正文与作者人设一致。",
        topicAlignment: "当前正文与主题一致。",
      },
    },
  });
  expect(factCheckSaved.ok()).toBeTruthy();

  const prosePolishSaved = await request.patch(`${baseURL}/api/articles/${articleId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "语言已压缩到可发布状态。",
        overallDiagnosis: "表达清晰。",
        strengths: ["结构清楚"],
        issues: [
          {
            type: "句子稍长",
            example: "首段有一处并列过长。",
            suggestion: "改成短句。",
          },
        ],
        rewrittenLead: "真正影响公众号交付速度的，不是不会生成，而是每次都要在核查、表达和发布之间反复返工。",
      },
    },
  });
  expect(prosePolishSaved.ok()).toBeTruthy();

  const workflowReady = await request.patch(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "目标读者已经明确。",
        coreReaderLabel: "公众号作者",
        selection: {
          selectedReaderLabel: "公众号作者",
          selectedLanguageGuidance: "结论先行，少讲套话。",
          selectedBackgroundAwareness: "有基础实操经验",
          selectedReadabilityLevel: "兼顾专业",
          selectedCallToAction: "结尾给出发布动作。",
        },
      },
    },
  });
  expect(workflowReady.ok()).toBeTruthy();

  const strategyReady = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: "公众号作者",
      coreAssertion: "把核查、润色、封面和发布守门前置，才能真正减少公众号返工。",
      whyNow: "因为现在很多团队已经不缺流程图，真正缺的是能落到真实交付里的发布闭环。",
      targetPackage: "高完成度判断文",
      publishWindow: "48h",
      endingAction: "先把这条发布链路跑通，再扩到下一篇。",
      firstHandObservation: "我最近连续看了几轮公众号交付返工，最常见的问题都不是不会写，而是发布前才发现证据和封面没跟上。",
      realSceneOrDialogue: "有编辑在最后一轮 review 里直接说过一句：稿子没问题，但草稿箱就是发不出去。",
      nonDelegableTruth: "真正拖慢交付的，从来不是模型生成速度，而是最后一公里没人把关。",
    },
  });
  expect(strategyReady.ok()).toBeTruthy();

  const evidenceReady = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方流程说明",
          excerpt: "官方说明写明，核查、润色、封面和发布守门已经合并到一条交付链路。",
          sourceType: "url",
          sourceUrl: "https://example.com/official-workflow",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "返工节点记录",
          excerpt: "2026 年之后，团队开始把返工问题前置到核查阶段处理，发布成功率随之提升。",
          sourceType: "manual",
          researchTag: "turningPoint",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "竞品对比观察",
          excerpt: "对比其他内容工具，这套流程把发布返工压到了最后一步之前，而不是等草稿箱失败后再补。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "社区反例反馈",
          excerpt: "也有团队反馈，如果底层素材没整理好，返工还是会在发布前集中爆发。",
          sourceType: "url",
          sourceUrl: "https://community.example.com/workflow-thread",
          researchTag: "contradiction",
          evidenceRole: "counterEvidence",
        },
      ],
    },
  });
  expect(evidenceReady.ok()).toBeTruthy();

  const userId = await getCurrentUserId(baseURL, request, cookie);
  const manualMaterial = await createFragment({
    userId,
    sourceType: "manual",
    title: "返工现场笔记",
    rawContent: "周二晚上十点，编辑把稿子退回来，只留了一句：内容能发，但草稿箱又卡住了。",
    distilledContent: "编辑反馈：内容能发，但草稿箱又卡住了。返工问题集中出现在发布前的最后一步。",
  });
  expect(Number(manualMaterial?.id || 0)).toBeGreaterThan(0);
  const urlMaterial = await createFragment({
    userId,
    sourceType: "url",
    title: "发布链路说明",
    rawContent: "核查、封面、连接和发布守门被合并到同一条交付链路中。",
    distilledContent: "外部说明显示，核查、封面、连接和发布守门已经被前置到同一条交付链路。",
    sourceUrl: "https://example.com/publish-chain",
  });
  expect(Number(urlMaterial?.id || 0)).toBeGreaterThan(0);
  const nodes = await request.get(`${baseURL}/api/articles/${articleId}/nodes`, {
    headers: { Cookie: cookie },
  });
  expect(nodes.ok()).toBeTruthy();
  const nodesJson = await nodes.json();
  const articleNodes = Array.isArray(nodesJson.data) ? nodesJson.data : [];
  expect(articleNodes.length).toBeGreaterThan(0);
  const firstNodeId = Number(articleNodes[0]?.id || 0);
  const secondNodeId = Number(articleNodes[1]?.id || articleNodes[0]?.id || 0);
  expect(firstNodeId).toBeGreaterThan(0);
  expect(secondNodeId).toBeGreaterThan(0);
  const attachedManual = await request.post(`${baseURL}/api/articles/${articleId}/outline-materials`, {
    headers: { Cookie: cookie },
    data: {
      action: "attachExisting",
      nodeId: firstNodeId,
      fragmentId: manualMaterial?.id,
      usageMode: "rewrite",
    },
  });
  expect(attachedManual.ok()).toBeTruthy();
  const attachedUrl = await request.post(`${baseURL}/api/articles/${articleId}/outline-materials`, {
    headers: { Cookie: cookie },
    data: {
      action: "attachExisting",
      nodeId: secondNodeId,
      fragmentId: urlMaterial?.id,
      usageMode: "rewrite",
    },
  });
  expect(attachedUrl.ok()).toBeTruthy();
  const coverGenerated = await generateCoverCandidatesForTest({
    userId,
    articleId,
    title: selectedTitle,
  });
  expect(Array.isArray(coverGenerated.candidates)).toBeTruthy();
  const coverSelected = await selectCoverCandidateForTest({
    userId,
    candidateId: coverGenerated.candidates[0].id,
  });
  expect(String(coverSelected.imageUrl || "")).toContain("/generated-assets/");

  return {
    articleId,
    selectedTitle,
  };
}

async function createDeepWritingReadyArticle(
  baseURL: string,
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  input?: {
    title?: string;
    fragmentTitle?: string;
    fragmentContent?: string;
  },
) {
  await ensurePersona(baseURL, request, cookie);
  const { articleId } = await createArticleForTest(baseURL, request, cookie, {
    title: input?.title || `E2E 深度写作执行卡 ${Date.now()}`,
  });

  const capture = await createManualFragmentForTest(baseURL, request, cookie, {
    title: input?.fragmentTitle || "深度写作素材",
    content:
      input?.fragmentContent
      || "2026 年，内容团队开始把研究、受众、执行卡和发布守卫串成一条链路。真正的差别不再是谁写得快，而是谁能把判断、素材密度和作者状态同时压进正文。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const audience = await request.post(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
  });
  expect(audience.ok()).toBeTruthy();
  const audienceJson = await audience.json();
  const audienceSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedReaderLabel: String(audienceJson.data.payload?.readerSegments?.[0]?.label || "").trim() || "内容团队负责人",
          selectedLanguageGuidance: String(audienceJson.data.payload?.languageGuidance?.[0] || "").trim() || "判断先行，少讲套话。",
          selectedBackgroundAwareness: String(audienceJson.data.payload?.backgroundAwarenessOptions?.[0] || "").trim() || null,
          selectedReadabilityLevel: String(audienceJson.data.payload?.readabilityOptions?.[0] || "").trim() || null,
          selectedCallToAction: String(audienceJson.data.payload?.recommendedCallToAction || "").trim() || "结尾给出下一步动作。",
        },
      },
    },
  });
  expect(audienceSave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(
    outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || input?.title || "E2E 深度写作执行卡",
  ).trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();

  return {
    articleId,
    selectedTitle,
    deepWritingJson,
  };
}

async function getFirstOfficialTemplateId(baseURL: string, request: import("@playwright/test").APIRequestContext, cookie: string) {
  const response = await request.get(`${baseURL}/api/templates`, {
    headers: { Cookie: cookie },
  });
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  const template = (Array.isArray(json.data) ? json.data : []).find(
    (item: { id?: string; ownerUserId?: number | null }) => item.ownerUserId == null && typeof item.id === "string" && item.id.trim(),
  );
  expect(template).toBeTruthy();
  return String(template.id);
}

test("warroom endpoint stays stable after login", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);

  const me = await request.get(`${baseURL}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  expect(me.ok()).toBeTruthy();
  const meJson = await me.json();
  expect(meJson.data.username).toBe("huozi");

  const warroom = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: cookie },
  });
  expect(warroom.ok()).toBeTruthy();
  const warroomJson = await warroom.json();
  expect(Array.isArray(warroomJson.data.topicPool)).toBeTruthy();
  if ((warroomJson.data.topicPool as Array<unknown>).length > 0) {
    const first = warroomJson.data.topicPool[0] as {
      relatedSourceNames?: unknown;
      relatedSourceUrls?: unknown;
      freshnessScore?: unknown;
      relevanceScore?: unknown;
      priorityScore?: unknown;
    };
    expect(Array.isArray(first.relatedSourceNames)).toBeTruthy();
    expect(Array.isArray(first.relatedSourceUrls)).toBeTruthy();
    expect(typeof first.freshnessScore === "number" || first.freshnessScore === null).toBeTruthy();
    expect(typeof first.relevanceScore === "number" || first.relevanceScore === null).toBeTruthy();
    expect(typeof first.priorityScore === "number" || first.priorityScore === null).toBeTruthy();
  }

  const warroomAgain = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: cookie },
  });
  expect(warroomAgain.ok()).toBeTruthy();
  const warroomAgainJson = await warroomAgain.json();
  expect(Array.isArray(warroomAgainJson.data.topicPool)).toBeTruthy();
  expect((warroomJson.data.topicPool as Array<{ title?: string }>).map((item) => item.title)).toEqual(
    (warroomAgainJson.data.topicPool as Array<{ title?: string }>).map((item) => item.title),
  );

});

test("topic radar visible count follows free pro ultra plan gates", async ({ request, baseURL }) => {
  const opsCookie = await loginAsOps(baseURL!, request);
  const freeUser = await createE2EUser(baseURL!, request, opsCookie, { planCode: "free" });
  const proUser = await createE2EUser(baseURL!, request, opsCookie, { planCode: "pro" });
  const ultraUser = await createE2EUser(baseURL!, request, opsCookie, { planCode: "ultra" });
  const freeCookie = await loginWithPassword(baseURL!, request, {
    username: freeUser.username,
    password: freeUser.password,
  });
  const proCookie = await loginWithPassword(baseURL!, request, {
    username: proUser.username,
    password: proUser.password,
  });
  const ultraCookie = await loginWithPassword(baseURL!, request, {
    username: ultraUser.username,
    password: ultraUser.password,
  });
  await ensurePersona(baseURL!, request, freeCookie);
  await ensurePersona(baseURL!, request, proCookie);
  await ensurePersona(baseURL!, request, ultraCookie);

  const freeRadar = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: freeCookie },
  });
  expect(freeRadar.ok()).toBeTruthy();
  const freeJson = await freeRadar.json();
  const freeCount = Array.isArray(freeJson.data.topicPool) ? freeJson.data.topicPool.length : 0;
  expect(freeCount).toBeLessThanOrEqual(1);

  const proRadar = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: proCookie },
  });
  expect(proRadar.ok()).toBeTruthy();
  const proJson = await proRadar.json();
  const proCount = Array.isArray(proJson.data.topicPool) ? proJson.data.topicPool.length : 0;
  expect(proCount).toBeLessThanOrEqual(5);
  expect(proCount).toBeGreaterThanOrEqual(freeCount);

  const ultraRadar = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: ultraCookie },
  });
  expect(ultraRadar.ok()).toBeTruthy();
  const ultraJson = await ultraRadar.json();
  const ultraCount = Array.isArray(ultraJson.data.topicPool) ? ultraJson.data.topicPool.length : 0;
  expect(ultraCount).toBeLessThanOrEqual(10);
  expect(ultraCount).toBeGreaterThanOrEqual(proCount);
});

test("first entry blocks core writer flow until persona is configured", async ({ request, baseURL }) => {
  const opsCookie = await loginAsOps(baseURL!, request);
  const user = await createE2EUser(baseURL!, request, opsCookie, { planCode: "free" });
  const userCookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });

  const dashboard = await request.get(`${baseURL}/dashboard`, {
    headers: { Cookie: userCookie },
  });
  expect(dashboard.ok()).toBeTruthy();
  const dashboardHtml = await dashboard.text();
  expect(dashboardHtml).toContain("先配置你的写作身份，再进入系统。");
  expect(dashboardHtml).toContain("先完成人设配置");
  expect(dashboardHtml).toContain("当前写作区内容已被锁定。");

  const warroom = await request.get(`${baseURL}/api/warroom`, {
    headers: { Cookie: userCookie },
  });
  expect(warroom.ok()).toBeTruthy();
  const warroomJson = await warroom.json();
  expect(Array.isArray(warroomJson.data?.topicPool)).toBeTruthy();
  expect(Array.isArray(warroomJson.data?.series)).toBeTruthy();
  expect(warroomJson.data?.series).toHaveLength(0);

  const createArticle = await request.post(`${baseURL}/api/articles`, {
    headers: { Cookie: userCookie },
    data: {
      title: "未配置人设的稿件",
    },
  });
  expect(createArticle.ok()).toBeFalsy();
  const createArticleJson = await createArticle.json();
  expect(String(createArticleJson.error || "")).toContain("请先配置至少 1 个默认作者人设");
});

test("writer shell keeps four primary entries", async ({ request, baseURL }) => {
  const opsCookie = await loginAsOps(baseURL!, request);
  const user = await createE2EUser(baseURL!, request, opsCookie, { planCode: "free" });
  const userCookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });
  await ensurePersona(baseURL!, request, userCookie);

  const page = await request.get(`${baseURL}/dashboard`, {
    headers: { Cookie: userCookie },
  });
  expect(page.ok()).toBeTruthy();
  const html = await page.text();
  expect(html).toContain("作战台");
  expect(html).toContain("稿件");
  expect(html).toContain("复盘");
  expect(html).toContain("设置");
});

test("writer core flow supports capture, generate, template extract and export", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 稿件",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "E2E 碎片",
      content: "2026 年内容团队开始重新审视 AI 写作流程，核心变量是事实密度、语言辨识度和发布速度。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  expect(String(generatedJson.data.markdownContent || "")).toContain("E2E 稿件");

  const commanded = await request.post(`${baseURL}/api/articles/${articleId}/command`, {
    headers: { Cookie: cookie },
    data: {
      command: "为这篇稿件补 3 个更锋利的小标题",
    },
  });
  expect(commanded.ok()).toBeTruthy();
  const commandedJson = await commanded.json();
  expect(String(commandedJson.data.markdownContent || "")).toContain("E2E 稿件");

  const extracted = await request.post(`${baseURL}/api/templates/extract`, {
    headers: { Cookie: cookie },
    data: {
      url: `${baseURL}/pricing`,
    },
  });
  expect(extracted.ok()).toBeTruthy();
  const extractedJson = await extracted.json();
  expect(String(extractedJson.data.templateId || "")).toContain("external-");
  expect(String(extractedJson.data.config?.schemaVersion || "")).toBe("v2");
  expect(String(extractedJson.data.config?.layout?.backgroundStyle || "")).not.toBe("");
  expect(String(extractedJson.data.config?.typography?.titleStyle || "")).not.toBe("");
  expect(String(extractedJson.data.config?.blocks?.recommendationStyle || "")).not.toBe("");

  const templates = await request.get(`${baseURL}/api/templates`, {
    headers: { Cookie: cookie },
  });
  expect(templates.ok()).toBeTruthy();
  const templatesJson = await templates.json();
  expect(
    Array.isArray(templatesJson.data) &&
      templatesJson.data.some((item: { id?: string; ownerUserId?: number | null }) => item.id === extractedJson.data.templateId && item.ownerUserId != null),
  ).toBeTruthy();

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {
      templateId: extractedJson.data.templateId,
    },
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  expect(Array.isArray(previewJson.data.templateSummary)).toBeTruthy();
  expect(previewJson.data.templateSummary.some((item: string) => item.includes("背景：") || item.includes("标题："))).toBeTruthy();
  expect(String(previewJson.data.finalHtml || "")).toContain("<article");

  const exported = await request.get(`${baseURL}/api/articles/${articleId}/export?format=markdown`, {
    headers: { Cookie: cookie },
  });
  expect(exported.ok()).toBeTruthy();
  const markdown = await exported.text();
  expect(markdown).toContain("E2E 稿件");
});

test("writer workflow supports stage artifacts from audience to deep writing", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  const persona = await ensurePersona(baseURL!, request, cookie);
  expect(persona).toBeTruthy();

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 阶段产物稿件",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "阶段产物素材",
      content: "2026 年，内容产品开始把选题、人设、受众、结构和事实核查接成一条可追踪工作流，关键约束是信息密度、可信度和发布效率。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const audience = await request.post(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
  });
  expect(audience.ok()).toBeTruthy();
  const audienceJson = await audience.json();
  expect(String(audienceJson.data.stageCode)).toBe("audienceAnalysis");
  expect(Array.isArray(audienceJson.data.payload?.readerSegments)).toBeTruthy();

  const selectedReaderLabel = String(audienceJson.data.payload?.readerSegments?.[0]?.label || "").trim();
  const selectedLanguageGuidance = String(audienceJson.data.payload?.languageGuidance?.[0] || "").trim();
  const audienceSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedReaderLabel,
          selectedLanguageGuidance,
          selectedBackgroundAwareness: String(audienceJson.data.payload?.backgroundAwarenessOptions?.[0] || "").trim() || null,
          selectedReadabilityLevel: String(audienceJson.data.payload?.readabilityOptions?.[0] || "").trim() || null,
          selectedCallToAction: String(audienceJson.data.payload?.recommendedCallToAction || "").trim() || "结尾给出下一步观察点。",
        },
      },
    },
  });
  expect(audienceSave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  expect(String(outlineJson.data.stageCode)).toBe("outlinePlanning");
  expect(Array.isArray(outlineJson.data.payload?.outlineSections)).toBeTruthy();

  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 阶段产物稿件").trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();
  expect(String(deepWritingJson.data.stageCode)).toBe("deepWriting");
  expect(String(deepWritingJson.data.payload?.selectedTitle || "")).not.toBe("");
  expect(Array.isArray(deepWritingJson.data.payload?.sectionBlueprint)).toBeTruthy();
  expect((deepWritingJson.data.payload?.sectionBlueprint || []).length).toBeGreaterThan(0);
  expect(Array.isArray(deepWritingJson.data.payload?.voiceChecklist)).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  expect(String(generatedJson.data.markdownContent || "")).toContain(selectedTitle);

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  expect(previewJson.data.publishGuard.canPublish).toBe(false);
  expect(Array.isArray(previewJson.data.publishGuard.checks)).toBeTruthy();
  expect(Array.isArray(previewJson.data.publishGuard.stageReadiness)).toBeTruthy();
  expect(typeof previewJson.data.publishGuard.aiNoise?.score).toBe("number");
  expect(typeof previewJson.data.publishGuard.materialReadiness?.attachedFragmentCount).toBe("number");
  expect(typeof previewJson.data.publishGuard.connectionHealth?.status).toBe("string");
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "outlinePlanning")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "deepWriting")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "wechatConnection")?.status).toBe("blocked");
  expect(["warning", "passed"]).toContain(String(checks.find((item) => item.key === "prosePolish")?.status || ""));
});

test("deep writing exposes comparison cards and opening preview respects prototype and state overrides", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  const { articleId, deepWritingJson } = await createDeepWritingReadyArticle(baseURL!, request, cookie, {
    title: "E2E 原型状态对比与预览",
  });

  const payload = deepWritingJson.data.payload as {
    articlePrototype?: string;
    stateVariantCode?: string;
    prototypeComparisons?: Array<Record<string, unknown>>;
    stateComparisons?: Array<Record<string, unknown>>;
  };
  const prototypeComparisons = Array.isArray(payload.prototypeComparisons) ? payload.prototypeComparisons : [];
  const stateComparisons = Array.isArray(payload.stateComparisons) ? payload.stateComparisons : [];
  expect(prototypeComparisons.length).toBeGreaterThan(1);
  expect(stateComparisons.length).toBeGreaterThan(1);
  expect(String(prototypeComparisons[0]?.openingPatternLabel || "")).not.toBe("");
  expect(String(prototypeComparisons[0]?.syntaxPatternLabel || "")).not.toBe("");
  expect(String(prototypeComparisons[0]?.endingPatternLabel || "")).not.toBe("");
  expect(String(stateComparisons[0]?.openingPatternLabel || "")).not.toBe("");
  expect(String(stateComparisons[0]?.syntaxPatternLabel || "")).not.toBe("");
  expect(String(stateComparisons[0]?.endingPatternLabel || "")).not.toBe("");

  const currentPrototypeCode = String(payload.articlePrototype || "").trim();
  const currentStateCode = String(payload.stateVariantCode || "").trim();
  const prototypeOverride = String(
    prototypeComparisons.find((item) => String(item.code || "").trim() !== currentPrototypeCode)?.code
      || prototypeComparisons[0]?.code
      || "",
  ).trim();
  const stateOverride = String(
    stateComparisons.find((item) => String(item.code || "").trim() !== currentStateCode)?.code
      || stateComparisons[0]?.code
      || "",
  ).trim();
  expect(prototypeOverride).not.toBe("");
  expect(stateOverride).not.toBe("");

  const overriddenDeepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
    data: {
      articlePrototypeCode: prototypeOverride,
      stateVariantCode: stateOverride,
    },
  });
  expect(overriddenDeepWriting.ok()).toBeTruthy();
  const overriddenDeepWritingJson = await overriddenDeepWriting.json();
  expect(String(overriddenDeepWritingJson.data.payload?.articlePrototype || "")).toBe(prototypeOverride);
  expect(String(overriddenDeepWritingJson.data.payload?.stateVariantCode || "")).toBe(stateOverride);
  expect(Array.isArray(overriddenDeepWritingJson.data.payload?.prototypeComparisons)).toBeTruthy();
  expect(Array.isArray(overriddenDeepWritingJson.data.payload?.stateComparisons)).toBeTruthy();

  const openingPreview = await request.post(`${baseURL}/api/articles/${articleId}/generate/opening-preview`, {
    headers: { Cookie: cookie },
    data: {
      articlePrototypeCode: prototypeOverride,
      stateVariantCode: stateOverride,
    },
  });
  expect(openingPreview.ok()).toBeTruthy();
  const openingPreviewJson = await openingPreview.json();
  expect(String(openingPreviewJson.data.previewMarkdown || "")).not.toBe("");
  expect(String(openingPreviewJson.data.articlePrototypeCode || "")).toBe(prototypeOverride);
  expect(String(openingPreviewJson.data.stateVariantCode || "")).toBe(stateOverride);
  expect(String(openingPreviewJson.data.articlePrototypeLabel || "")).not.toBe("");
  expect(String(openingPreviewJson.data.stateVariantLabel || "")).not.toBe("");
});

test("article workflow inserts research brief before audience analysis", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 工作流研究前置",
  });

  const workflow = await request.get(`${baseURL}/api/articles/${articleId}/workflow`, {
    headers: { Cookie: cookie },
  });
  expect(workflow.ok()).toBeTruthy();
  const workflowJson = await workflow.json();
  expect(String(workflowJson.data.currentStageCode || "")).toBe("topicRadar");
  expect((workflowJson.data.stages || []).map((item: { code?: string }) => String(item.code || ""))).toEqual([
    "topicRadar",
    "researchBrief",
    "audienceAnalysis",
    "outlinePlanning",
    "deepWriting",
    "factCheck",
    "prosePolish",
    "coverImage",
    "layout",
    "publish",
  ]);
  expect(String(workflowJson.data.stages?.[1]?.status || "")).toBe("pending");

  const setResearch = await request.patch(`${baseURL}/api/articles/${articleId}/workflow`, {
    headers: { Cookie: cookie },
    data: {
      stageCode: "researchBrief",
      action: "set",
    },
  });
  expect(setResearch.ok()).toBeTruthy();
  const setResearchJson = await setResearch.json();
  expect(String(setResearchJson.data.currentStageCode || "")).toBe("researchBrief");
  expect(String(setResearchJson.data.stages?.[0]?.status || "")).toBe("completed");
  expect(String(setResearchJson.data.stages?.[1]?.status || "")).toBe("current");

  const completeResearch = await request.patch(`${baseURL}/api/articles/${articleId}/workflow`, {
    headers: { Cookie: cookie },
    data: {
      stageCode: "researchBrief",
      action: "complete",
    },
  });
  expect(completeResearch.ok()).toBeTruthy();
  const completeResearchJson = await completeResearch.json();
  expect(String(completeResearchJson.data.currentStageCode || "")).toBe("audienceAnalysis");
  expect(String(completeResearchJson.data.stages?.[1]?.status || "")).toBe("completed");
  expect(String(completeResearchJson.data.stages?.[2]?.status || "")).toBe("current");
});

test("research brief can generate hv-analysis style research scaffolding and feed strategy suggestions", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究简报稿件",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "研究素材",
      content: "2023 年起，内容团队开始把研究、写作和发布串成流水线。到 2025 年，越来越多团队把事实核查前置。2026 年，真正拉开差距的已经不是谁写得更快，而是谁能同时补时间脉络、横向对比和用户反馈。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const research = await request.post(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
  });
  expect(research.ok()).toBeTruthy();
  const researchJson = await research.json();
  expect(String(researchJson.data.stageCode)).toBe("researchBrief");
  expect(String(researchJson.data.payload?.coreQuestion || "")).not.toBe("");
  expect(Array.isArray(researchJson.data.payload?.timelineCards)).toBeTruthy();
  expect((researchJson.data.payload?.timelineCards || []).length).toBeGreaterThan(0);
  expect(Array.isArray(researchJson.data.payload?.timelineCards?.[0]?.sources)).toBeTruthy();
  expect(String(researchJson.data.payload?.timelineCards?.[0]?.summary || "")).not.toBe("");
  expect(Array.isArray(researchJson.data.payload?.comparisonCards)).toBeTruthy();
  expect((researchJson.data.payload?.comparisonCards || []).length).toBeGreaterThan(0);
  expect(Array.isArray(researchJson.data.payload?.comparisonCards?.[0]?.sources)).toBeTruthy();
  expect(String(researchJson.data.payload?.comparisonCards?.[0]?.subject || "")).not.toBe("");
  expect(Array.isArray(researchJson.data.payload?.intersectionInsights)).toBeTruthy();
  expect((researchJson.data.payload?.intersectionInsights || []).length).toBeGreaterThan(0);
  expect(Array.isArray(researchJson.data.payload?.intersectionInsights?.[0]?.sources)).toBeTruthy();
  expect(String(researchJson.data.payload?.intersectionInsights?.[0]?.insight || "")).not.toBe("");
  expect(typeof researchJson.data.payload?.sourceCoverage?.sufficiency).toBe("string");

  const strategy = await request.get(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
  });
  expect(strategy.ok()).toBeTruthy();
  const strategyJson = await strategy.json();
  expect(String(strategyJson.data.targetReader || "")).not.toBe("");
  expect(String(strategyJson.data.coreAssertion || "")).not.toBe("");
  expect(String(strategyJson.data.whyNow || "")).not.toBe("");
  expect(String(strategyJson.data.researchHypothesis || "")).not.toBe("");
  expect(String(strategyJson.data.marketPositionInsight || "")).not.toBe("");
  expect(String(strategyJson.data.historicalTurningPoint || "")).not.toBe("");

  const strategySave = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: strategyJson.data.targetReader,
      coreAssertion: strategyJson.data.coreAssertion,
      whyNow: strategyJson.data.whyNow,
      researchHypothesis: "研究假设-持久化验证",
      marketPositionInsight: "位置洞察-持久化验证",
      historicalTurningPoint: "历史转折点-持久化验证",
    },
  });
  expect(strategySave.ok()).toBeTruthy();

  const persistedStrategy = await request.get(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
  });
  expect(persistedStrategy.ok()).toBeTruthy();
  const persistedStrategyJson = await persistedStrategy.json();
  expect(String(persistedStrategyJson.data.researchHypothesis || "")).toBe("研究假设-持久化验证");
  expect(String(persistedStrategyJson.data.marketPositionInsight || "")).toBe("位置洞察-持久化验证");
  expect(String(persistedStrategyJson.data.historicalTurningPoint || "")).toBe("历史转折点-持久化验证");

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.some((item) => item.key === "researchBrief")).toBeTruthy();
});

test("research brief can auto-supplement external web sources before generation", async ({ request, baseURL }) => {
  test.skip(!process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT, "需要显式配置 research search endpoint");
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 外部补源研究",
  });

  const research = await request.post(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
  });
  expect(research.ok()).toBeTruthy();
  const researchJson = await research.json();
  const externalResearch = researchJson.data.payload?.externalResearch as {
    attempted?: boolean;
    discoveredUrls?: string[];
    attached?: Array<{ sourceUrl?: string }>;
  };
  expect(Boolean(externalResearch?.attempted)).toBe(true);
  expect(Array.isArray(externalResearch?.discoveredUrls)).toBeTruthy();
  expect((externalResearch?.discoveredUrls || []).some((item) => String(item || "").includes("/api/tools/mock-research-source/"))).toBeTruthy();
  expect(Array.isArray(externalResearch?.attached)).toBeTruthy();
  expect((externalResearch?.attached || []).length).toBeGreaterThan(0);

  const nodes = await request.get(`${baseURL}/api/articles/${articleId}/nodes`, {
    headers: { Cookie: cookie },
  });
  expect(nodes.ok()).toBeTruthy();
  const nodesJson = await nodes.json();
  const attachedFragments = (nodesJson.data as Array<{ fragments?: Array<{ sourceType?: string; sourceUrl?: string }> }>)
    .flatMap((item) => Array.isArray(item.fragments) ? item.fragments : []);
  expect(
    attachedFragments.some((fragment) =>
      fragment.sourceType === "url" && String(fragment.sourceUrl || "").includes("/api/tools/mock-research-source/")),
  ).toBeTruthy();
});

test("research workspace writeback persists strategy card and evidence package", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究写回落库",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究层已经给出明确的目标读者、主判断和为什么现在值得写。",
        coreQuestion: "为什么 research workspace 的写回必须直接落库？",
        sourceCoverage: {
          official: ["官方说明"],
          industry: ["行业分析"],
          comparison: ["同类产品对比"],
          userVoice: ["用户反馈"],
          timeline: ["时间节点"],
          sufficiency: "ready",
          missingCategories: [],
          note: "研究覆盖已达可写状态。",
        },
        timelineCards: [
          {
            phase: "起点",
            title: "研究写回起点",
            summary: "最早的问题是研究层只停留在草稿，不会自动沉到后续结构里。",
            signals: ["研究写回起点"],
          },
        ],
        comparisonCards: [
          {
            subject: "对照组",
            position: "真正差异在于是否把研究结果变成正式状态，而不是只显示在面板里。",
            differences: ["状态差异"],
          },
        ],
        intersectionInsights: [
          {
            insight: "如果写回不落库，后续深写和核查仍然拿不到稳定研究结论。",
            whyNow: "因为现在研究层已经是正式前置阶段，不能停留在 UI 草稿。",
          },
        ],
        strategyWriteback: {
          targetReader: "需要把研究结果沉到生产链路里的内容负责人",
          coreAssertion: "研究写回必须直接落库，才能让后续链路真正复用。",
          whyNow: "因为 researchBrief 已经是正式工作流阶段，不能只写进前端状态。",
          researchHypothesis: "只要研究写回直接保存，后续阶段就能稳定复用同一组判断。",
          marketPositionInsight: "真正的产品差异在于研究层有没有成为持久状态，而不是临时建议。",
          historicalTurningPoint: "researchBrief 被提升为正式工作流节点的这一步。",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const workflowSet = await request.patch(`${baseURL}/api/articles/${articleId}/workflow`, {
    headers: { Cookie: cookie },
    data: {
      stageCode: "researchBrief",
      action: "set",
    },
  });
  expect(workflowSet.ok()).toBeTruthy();

  const strategyWriteback = await request.post(`${baseURL}/api/articles/${articleId}/strategy/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(strategyWriteback.ok()).toBeTruthy();

  const strategy = await request.get(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
  });
  expect(strategy.ok()).toBeTruthy();
  const strategyJson = await strategy.json();
  expect(String(strategyJson.data.targetReader || "")).toBe("需要把研究结果沉到生产链路里的内容负责人");
  expect(String(strategyJson.data.coreAssertion || "")).toBe("研究写回必须直接落库，才能让后续链路真正复用。");
  expect(String(strategyJson.data.whyNow || "")).toContain("researchBrief 已经是正式工作流阶段");
  expect(String(strategyJson.data.researchHypothesis || "")).toContain("只要研究写回直接保存");
  expect(String(strategyJson.data.marketPositionInsight || "")).toContain("真正的产品差异");
  expect(String(strategyJson.data.historicalTurningPoint || "")).toContain("正式工作流节点");

  const factCheckPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究导向证据已经整理成支持和反向两侧。",
        evidenceCards: [
          {
            claim: "研究写回必须直接落库。",
            supportLevel: "strong",
            supportingEvidence: [
              {
                title: "支持证据-1",
                excerpt: "只有把研究结论直接保存，后续深写和核查才会引用到同一套判断。",
                sourceType: "url",
                sourceUrl: "https://example.com/research-writeback-support",
                rationale: "说明持久化是后续链路复用的前提。",
                researchTag: "timeline",
                evidenceRole: "supportingEvidence",
              },
            ],
            counterEvidence: [
              {
                title: "反证-1",
                excerpt: "如果只是前端草稿，刷新后研究结论就不会稳定存在于工作流里。",
                sourceType: "manual",
                sourceUrl: "",
                rationale: "提醒不能把临时状态当成正式写回。",
                researchTag: "contradiction",
                evidenceRole: "counterEvidence",
              },
            ],
          },
        ],
      },
    },
  });
  expect(factCheckPatched.ok()).toBeTruthy();

  const evidenceWriteback = await request.post(`${baseURL}/api/articles/${articleId}/evidence/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(evidenceWriteback.ok()).toBeTruthy();
  const evidenceWritebackJson = await evidenceWriteback.json();
  expect(Number(evidenceWritebackJson.data?.appendedCount || 0)).toBeGreaterThan(0);

  const evidence = await request.get(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
  });
  expect(evidence.ok()).toBeTruthy();
  const evidenceJson = await evidence.json();
  expect(Array.isArray(evidenceJson.data)).toBeTruthy();
  expect(evidenceJson.data.some((item: { title?: string; evidenceRole?: string }) => item.title === "支持证据-1" && item.evidenceRole === "supportingEvidence")).toBeTruthy();
  expect(evidenceJson.data.some((item: { title?: string; evidenceRole?: string }) => item.title === "反证-1" && item.evidenceRole === "counterEvidence")).toBeTruthy();
});

test("research apply endpoints reject empty writeback payloads", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究写回空载荷",
  });

  const strategyWriteback = await request.post(`${baseURL}/api/articles/${articleId}/strategy/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(strategyWriteback.ok()).toBeFalsy();
  expect(strategyWriteback.status()).toBe(400);
  const strategyWritebackJson = await strategyWriteback.json();
  expect(String(strategyWritebackJson.error || "")).toContain("当前研究简报还没有可直接写回策略卡的字段");

  const evidenceWriteback = await request.post(`${baseURL}/api/articles/${articleId}/evidence/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(evidenceWriteback.ok()).toBeFalsy();
  expect(evidenceWriteback.status()).toBe(400);
  const evidenceWritebackJson = await evidenceWriteback.json();
  expect(String(evidenceWritebackJson.error || "")).toContain("当前还没有可写回证据包的研究导向建议");
});

test("research apply endpoints stay idempotent across repeated writes", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究写回幂等性",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究结论需要支持重复写回但不产生脏数据。",
        coreQuestion: "为什么研究写回必须保证重复触发后仍然稳定？",
        sourceCoverage: {
          official: ["官方说明"],
          industry: ["行业分析"],
          comparison: ["同类对比"],
          userVoice: ["用户反馈"],
          timeline: ["时间节点"],
          sufficiency: "ready",
          missingCategories: [],
          note: "研究覆盖已满足写回条件。",
        },
        timelineCards: [
          {
            phase: "起点",
            title: "幂等起点",
            summary: "第一次写回只应新增必要字段，第二次不应继续重复追加。",
            signals: ["幂等起点"],
          },
        ],
        comparisonCards: [
          {
            subject: "对照组",
            position: "研究写回应当保留用户已有字段，并且避免重复堆叠证据。",
            differences: ["幂等差异"],
          },
        ],
        intersectionInsights: [
          {
            insight: "重复触发研究写回时，真正重要的是状态稳定，而不是重复插入。",
            whyNow: "因为研究工作台和自动链路都可能多次触发同一动作。",
          },
        ],
        strategyWriteback: {
          targetReader: "关心研究状态稳定性的内容系统负责人",
          coreAssertion: "研究写回必须幂等，否则后续链路会被重复数据污染。",
          whyNow: "因为 research workspace 和自动链路都可能重复调用写回动作。",
          researchHypothesis: "只要写回接口幂等，多次触发也不会引入脏状态。",
          marketPositionInsight: "真正差异在于接口是不是把研究结果沉成稳定状态，而不是每次都重复追加。",
          historicalTurningPoint: "研究工作台开始支持一键写回的这个节点。",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const strategySeed = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetPackage: "保留的目标包",
      firstHandObservation: "保留的第一手观察",
    },
  });
  expect(strategySeed.ok()).toBeTruthy();

  const firstStrategyApply = await request.post(`${baseURL}/api/articles/${articleId}/strategy/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(firstStrategyApply.ok()).toBeTruthy();
  const secondStrategyApply = await request.post(`${baseURL}/api/articles/${articleId}/strategy/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(secondStrategyApply.ok()).toBeTruthy();

  const strategy = await request.get(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
  });
  expect(strategy.ok()).toBeTruthy();
  const strategyJson = await strategy.json();
  expect(String(strategyJson.data.coreAssertion || "")).toContain("研究写回必须幂等");
  expect(String(strategyJson.data.targetPackage || "")).toBe("保留的目标包");
  expect(String(strategyJson.data.firstHandObservation || "")).toBe("保留的第一手观察");

  const factCheckPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究导向证据需要支持重复写回时自动去重。",
        evidenceCards: [
          {
            claim: "研究写回必须幂等。",
            supportLevel: "strong",
            supportingEvidence: [
              {
                title: "幂等支持证据",
                excerpt: "第一次写回会新增这条支持证据，第二次不应重复插入。",
                sourceType: "url",
                sourceUrl: "https://example.com/idempotent-support",
                rationale: "说明写回应当去重。",
                researchTag: "timeline",
                evidenceRole: "supportingEvidence",
              },
            ],
            counterEvidence: [
              {
                title: "幂等反证",
                excerpt: "如果没有去重，多次写回会让同一条反证反复出现。",
                sourceType: "manual",
                sourceUrl: "",
                rationale: "提醒重复写回的风险。",
                researchTag: "contradiction",
                evidenceRole: "counterEvidence",
              },
            ],
          },
        ],
      },
    },
  });
  expect(factCheckPatched.ok()).toBeTruthy();

  const firstEvidenceApply = await request.post(`${baseURL}/api/articles/${articleId}/evidence/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(firstEvidenceApply.ok()).toBeTruthy();
  const firstEvidenceApplyJson = await firstEvidenceApply.json();
  expect(Number(firstEvidenceApplyJson.data?.appendedCount || 0)).toBeGreaterThan(0);

  const secondEvidenceApply = await request.post(`${baseURL}/api/articles/${articleId}/evidence/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(secondEvidenceApply.ok()).toBeTruthy();
  const secondEvidenceApplyJson = await secondEvidenceApply.json();
  expect(Number(secondEvidenceApplyJson.data?.appendedCount || 0)).toBe(0);

  const evidence = await request.get(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
  });
  expect(evidence.ok()).toBeTruthy();
  const evidenceJson = await evidence.json();
  const evidenceItems = Array.isArray(evidenceJson.data) ? evidenceJson.data : [];
  expect(evidenceItems.filter((item: { title?: string }) => item.title === "幂等支持证据")).toHaveLength(1);
  expect(evidenceItems.filter((item: { title?: string }) => item.title === "幂等反证")).toHaveLength(1);
});

test("research brief persistence syncs first-class research cards endpoint", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究卡片持久化",
  });

  const firstPatch = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究简报写入后，应当同步沉淀为一等研究卡片。",
        coreQuestion: "为什么 researchBrief 不能只保存在 payload_json？",
        timelineCards: [
          {
            phase: "起点",
            title: "研究卡片起点",
            summary: "最早的问题是研究卡片只存在于 researchBrief 结构体里，后续查询无法直接复用。",
            signals: ["研究卡片起点信号"],
            sources: [
              {
                label: "官方路线图说明",
                sourceType: "official",
                detail: "说明研究卡片需要成为正式资产。",
                sourceUrl: "https://example.com/official-roadmap",
              },
            ],
          },
        ],
        comparisonCards: [
          {
            subject: "临时草稿流",
            position: "真正差异在于研究结论是否成为后续链路能直接读取的正式状态。",
            differences: ["临时草稿不会稳定复用"],
            userVoices: ["刷新后状态丢失"],
            sources: [
              {
                label: "行业对比样本",
                sourceType: "comparison",
                detail: "对比只放在前端草稿与直接落库两种流程差异。",
                sourceUrl: "https://example.com/comparison",
              },
            ],
          },
        ],
        intersectionInsights: [
          {
            insight: "只有把研究结论拆成正式卡片，深写、核查和工作台才能共享同一套研究事实。",
            whyNow: "因为 researchBrief 已经是正式阶段，不再只是提示词前置草稿。",
            support: ["所有后续节点都需要复用这组研究判断"],
            caution: "不能把 UI 建议当成落库结果。",
            sources: [
              {
                label: "用户反馈回访",
                sourceType: "userVoice",
                detail: "内容负责人要求研究阶段产物可被后续步骤稳定读取。",
                sourceUrl: "https://example.com/user-voice",
              },
            ],
          },
        ],
      },
    },
  });
  expect(firstPatch.ok()).toBeTruthy();

  const firstCards = await request.get(`${baseURL}/api/articles/${articleId}/research-cards`, {
    headers: { Cookie: cookie },
  });
  expect(firstCards.ok()).toBeTruthy();
  const firstCardsJson = await firstCards.json();
  expect(Array.isArray(firstCardsJson.data)).toBeTruthy();
  expect(firstCardsJson.data).toHaveLength(3);

  const timelineCard = firstCardsJson.data.find((item: { cardKind?: string }) => item.cardKind === "timeline");
  expect(timelineCard).toBeTruthy();
  expect(String(timelineCard.title || "")).toBe("研究卡片起点");
  expect(String(timelineCard.summary || "")).toContain("后续查询无法直接复用");
  expect(String(timelineCard.payload?.phase || "")).toBe("起点");
  expect(Array.isArray(timelineCard.sources)).toBeTruthy();
  expect(String(timelineCard.sources?.[0]?.label || "")).toBe("官方路线图说明");
  expect(String(timelineCard.sources?.[0]?.sourceType || "")).toBe("official");

  const comparisonCard = firstCardsJson.data.find((item: { cardKind?: string }) => item.cardKind === "comparison");
  expect(comparisonCard).toBeTruthy();
  expect(String(comparisonCard.title || "")).toBe("临时草稿流");
  expect(String(comparisonCard.summary || "")).toContain("正式状态");

  const intersectionCard = firstCardsJson.data.find((item: { cardKind?: string }) => item.cardKind === "intersection");
  expect(intersectionCard).toBeTruthy();
  expect(String(intersectionCard.summary || "")).toContain("正式卡片");
  expect(String(intersectionCard.payload?.whyNow || "")).toContain("正式阶段");

  const overwritePatch = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        timelineCards: [
          {
            phase: "更新后",
            title: "研究卡片更新版",
            summary: "第二次保存后，研究卡片表应该整体替换为最新结果。",
            signals: ["研究卡片更新版"],
            sources: [
              {
                label: "更新后的时间线来源",
                sourceType: "timeline",
                detail: "验证 replace 语义而不是 append 语义。",
                sourceUrl: "https://example.com/timeline-refresh",
              },
            ],
          },
        ],
        comparisonCards: [],
        intersectionInsights: [],
      },
    },
  });
  expect(overwritePatch.ok()).toBeTruthy();

  const overwrittenCards = await request.get(`${baseURL}/api/articles/${articleId}/research-cards`, {
    headers: { Cookie: cookie },
  });
  expect(overwrittenCards.ok()).toBeTruthy();
  const overwrittenCardsJson = await overwrittenCards.json();
  expect(Array.isArray(overwrittenCardsJson.data)).toBeTruthy();
  expect(overwrittenCardsJson.data).toHaveLength(1);
  expect(String(overwrittenCardsJson.data[0]?.cardKind || "")).toBe("timeline");
  expect(String(overwrittenCardsJson.data[0]?.title || "")).toBe("研究卡片更新版");
  expect(String(overwrittenCardsJson.data[0]?.sources?.[0]?.label || "")).toBe("更新后的时间线来源");
});

test("outline planning emits research backbone anchors from research brief", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究锚点大纲",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "先用历史节点把问题抛出来，再用横向比较拉开差异，最后落成交汇判断。",
        coreQuestion: "为什么研究先行会改变内容生产质量？",
        timelineCards: [
          {
            phase: "转折",
            title: "历史节点-A1",
            summary: "历史节点-A1 代表内容工作流第一次把事实核查前置到写作之前。",
            signals: ["历史节点-A1"],
          },
        ],
        comparisonCards: [
          {
            subject: "横向对比-B2",
            position: "横向对比-B2 说明真正差异不在写得快，而在是否先完成研究骨架。",
            differences: ["横向对比-B2"],
          },
        ],
        intersectionInsights: [
          {
            insight: "交汇判断-C3 表明真正的内容优势来自研究判断链，而不是素材堆叠。",
            whyNow: "因为普通流水线已经无法支撑判断型长文。",
          },
        ],
        strategyWriteback: {
          coreAssertion: "交汇判断-C3 表明研究层先行才是真正的分水岭。",
          marketPositionInsight: "横向对比-B2 代表研究型工作流与素材拼装流的结构差异。",
          historicalTurningPoint: "历史节点-A1",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  expect(String(outlineJson.data.stageCode)).toBe("outlinePlanning");
  expect(String(outlineJson.data.payload?.researchBackbone?.openingTimelineAnchor || "")).not.toBe("");
  expect(String(outlineJson.data.payload?.researchBackbone?.middleComparisonAnchor || "")).not.toBe("");
  expect(String(outlineJson.data.payload?.researchBackbone?.coreInsightAnchor || "")).not.toBe("");
  expect(Array.isArray(outlineJson.data.payload?.outlineSections)).toBeTruthy();
  expect(String(outlineJson.data.payload?.outlineSections?.[0]?.researchAnchor || "")).not.toBe("");
  expect(
    (outlineJson.data.payload?.outlineSections || []).some((item: { researchFocus?: string }) => String(item.researchFocus || "") === "comparison"),
  ).toBeTruthy();
  expect(
    (outlineJson.data.payload?.outlineSections || []).some((item: { researchFocus?: string }) => String(item.researchFocus || "") === "intersection"),
  ).toBeTruthy();
});

test("deep writing execution card exposes research focus and lens from research brief", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究驱动执行卡",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "这篇需要让执行卡直接继承研究判断，而不是退回素材平铺。",
        coreQuestion: "为什么研究层应该直接改写 deepWriting 的执行卡？",
        timelineCards: [
          {
            phase: "转折",
            title: "历史节点-DW1",
            summary: "历史节点-DW1 说明判断型长文开始要求先有历史脉络再有正文。",
            signals: ["历史节点-DW1"],
          },
        ],
        comparisonCards: [
          {
            subject: "横向对比-DW2",
            position: "横向对比-DW2 说明真正差异在于有没有研究驱动的骨架。",
            differences: ["横向对比-DW2"],
          },
        ],
        intersectionInsights: [
          {
            insight: "交汇判断-DW3 表明执行卡应该先吃研究判断，再安排段落节奏。",
            whyNow: "因为单纯补文风已经不足以解决空洞内容。",
          },
        ],
        strategyWriteback: {
          coreAssertion: "交汇判断-DW3 表明研究层必须直接进入 deepWriting 执行卡。",
          marketPositionInsight: "横向对比-DW2 代表研究型执行卡和普通执行卡的真正差异。",
          historicalTurningPoint: "历史节点-DW1",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 研究驱动执行卡").trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();
  expect(String(deepWritingJson.data.payload?.researchFocus || "")).not.toBe("");
  expect(String(deepWritingJson.data.payload?.researchLens || "")).not.toBe("");
  expect(String(deepWritingJson.data.payload?.openingMove || "")).toMatch(/历史节点-DW1|交汇判断-DW3/);
});

test("deep writing prioritizes persisted strategy research fields over research brief defaults", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 策略研究字段优先级",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究简报先给出一版默认研究判断，后续要允许策略卡覆盖。",
        coreQuestion: "为什么策略卡里持久化的研究判断必须优先回流？",
        timelineCards: [
          {
            phase: "旧默认",
            title: "旧历史节点-S1",
            summary: "旧历史节点-S1 只是研究简报给出的默认切口。",
            signals: ["旧历史节点-S1"],
          },
        ],
        comparisonCards: [
          {
            subject: "旧位置判断-S2",
            position: "旧位置判断-S2 只是 researchBrief 的默认位置判断。",
            differences: ["旧位置判断-S2"],
          },
        ],
        intersectionInsights: [
          {
            insight: "旧交汇判断-S3 表示 researchBrief 已经有一版默认结论。",
            whyNow: "但后续仍然需要允许策略卡覆盖。",
          },
        ],
        strategyWriteback: {
          coreAssertion: "旧核心判断-S0",
          whyNow: "旧 why now-SY",
          researchHypothesis: "旧研究假设-SH",
          marketPositionInsight: "旧位置判断-S2",
          historicalTurningPoint: "旧历史节点-S1",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const strategySave = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: "研究型内容负责人",
      coreAssertion: "策略卡核心判断-SC",
      whyNow: "策略卡 why now-SW",
      researchHypothesis: "策略卡研究假设-SH",
      marketPositionInsight: "策略卡位置判断-SM",
      historicalTurningPoint: "策略卡历史转折-ST",
      endingAction: "把研究链先补齐再发。",
    },
  });
  expect(strategySave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 策略研究字段优先级").trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();
  expect(String(deepWritingJson.data.payload?.researchFocus || "")).toContain("策略卡位置判断-SM");
  expect(String(deepWritingJson.data.payload?.openingMove || "")).toContain("策略卡历史转折-ST");
  expect(String(deepWritingJson.data.payload?.centralThesis || "")).toContain("策略卡核心判断-SC");
});

test("deep writing applies bound writing style profile signals into state kernel", async ({ request, baseURL }) => {
  const opsCookie = await loginAsOps(baseURL!, request);
  const user = await createE2EUser(baseURL!, request, opsCookie, {
    planCode: "ultra",
  });
  const cookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });
  const persona = await ensurePersona(baseURL!, request, cookie);
  const writingStyleProfileId = await createWritingStyleProfileForTest(baseURL!, request, cookie, {
    name: "E2E 状态驱动文风资产",
  });

  const boundPersona = await request.patch(`${baseURL}/api/personas/${persona.id}`, {
    headers: { Cookie: cookie },
    data: {
      boundWritingStyleProfileId: writingStyleProfileId,
      isDefault: true,
    },
  });
  expect(boundPersona.ok()).toBeTruthy();

  const userId = await getCurrentUserId(baseURL!, request, cookie);
  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 文风资产驱动执行卡",
  });

  const draftSaved = await request.put(`${baseURL}/api/articles/${articleId}/draft`, {
    headers: { Cookie: cookie },
    data: {
      title: "E2E 文风资产驱动执行卡",
      markdownContent: [
        "# E2E 文风资产驱动执行卡",
        "",
        "这篇稿子要验证一件事：绑定文风资产之后，deepWriting 不能只把它当装饰，而要把事实密度、段落呼吸和惯用推进动作真正写进执行卡。",
        "",
        "如果执行卡没有吃到这些字段，所谓状态驱动写作就还是停留在标签层。",
      ].join("\n"),
      status: "draft",
    },
  });
  expect(draftSaved.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 文风资产驱动执行卡").trim();
  const outlineSaved = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSaved.ok()).toBeTruthy();

  const authoringContext = await getArticleAuthoringStyleContext(userId, articleId);
  expect(authoringContext.writingStyleProfile?.factDensity).toBe("高，每个判断后都要跟一个事实锚点。");
  expect(authoringContext.writingStyleProfile?.reusablePromptFragments).toContain("先把场景摊开，再亮判断。");
  expect(authoringContext.writingStyleProfile?.callbackPatterns).toContain("说回开头");

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();
  const deepWritingJson = await deepWriting.json();
  const payload = deepWritingJson.data.payload as {
    evidenceMode?: string;
    stateChecklist?: string[];
  };
  expect(String(payload.evidenceMode || "")).toContain("高，每个判断后都要跟一个事实锚点。");
  expect(Array.isArray(payload.stateChecklist)).toBeTruthy();
  expect((payload.stateChecklist || []).length).toBeGreaterThan(0);
});

test("fact check absorbs research support review from research brief", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究复核事实核查",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "研究复核素材",
      content: "2024 年内容团队开始把核查前置，2025 年开始补竞品差异，到了 2026 年，真正拉开差距的是谁能把历史转折、横向比较和交汇判断压进正文。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "先补时间脉络，再补横向比较，最后把交汇判断压进正文核查。",
        coreQuestion: "为什么研究层会直接改变判断型长文的可核查性？",
        sourceCoverage: {
          sufficiency: "ready",
          official: ["官方工作流公告"],
          industry: ["行业流程报道"],
          comparison: ["竞品流程对照"],
          userVoice: ["创作者反馈"],
          timeline: ["2024-2026 关键节点"],
          missingCategories: [],
          note: "基础来源类别已覆盖，可进入判断型写作。",
        },
        timelineCards: [
          {
            phase: "2024",
            title: "历史节点-R1",
            summary: "历史节点-R1 代表事实核查第一次被前置到正文生成之前。",
            signals: ["历史节点-R1"],
          },
        ],
        comparisonCards: [
          {
            subject: "横向对比-R2",
            position: "横向对比-R2 说明真正差异不在写得快，而在是否先建立研究骨架。",
            differences: ["横向对比-R2"],
          },
        ],
        intersectionInsights: [
          {
            insight: "交汇判断-R3 表明研究层先行会直接提升正文判断的可核查性。",
            whyNow: "因为拼素材式写法已经不足以支撑判断型长文。",
          },
        ],
        strategyWriteback: {
          targetReader: "内容团队负责人",
          coreAssertion: "交汇判断-R3 表明研究层先行才是可核查判断的前提。",
          whyNow: "现在值得写，是因为横向差异已经不再只是效率差异。",
          researchHypothesis: "只要研究卡片齐，事实核查会更容易站住。",
          marketPositionInsight: "横向对比-R2 代表研究型工作流与素材拼接流的结构差异。",
          historicalTurningPoint: "历史节点-R1",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 研究复核事实核查").trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();

  const factCheck = await request.post(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
  });
  expect(factCheck.ok()).toBeTruthy();
  const factCheckJson = await factCheck.json();
  expect(String(factCheckJson.data.payload?.researchReview?.summary || "")).not.toBe("");
  expect(String(factCheckJson.data.payload?.researchReview?.sourceCoverage || "")).toBe("ready");
  expect(String(factCheckJson.data.payload?.researchReview?.timelineSupport || "")).toBe("enough");
  expect(String(factCheckJson.data.payload?.researchReview?.comparisonSupport || "")).toBe("enough");
  expect(String(factCheckJson.data.payload?.researchReview?.intersectionSupport || "")).toBe("enough");
});

test("generate route prioritizes research brief anchors when composing正文", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究驱动正文",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "基础素材",
      content: "很多团队都在讨论写作流水线，但普通素材只能说明表象，真正关键的是历史转折和横向差异。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "需要围绕研究折返点-K47 解释为什么内容生产在 2026 年出现了新分水岭。",
        coreQuestion: "研究折返点-K47 为什么会在 2026 年成为内容生产分水岭？",
        mustCoverAngles: ["研究折返点-K47", "对比信号-M9"],
        timelineCards: [
          {
            phase: "2024",
            title: "研究折返点-K47",
            summary: "研究折返点-K47 指向的是核查前置之后，判断链开始稳定收敛。",
            signals: ["研究折返点-K47"],
          },
        ],
        comparisonCards: [
          {
            subject: "对比信号-M9",
            position: "对比信号-M9 说明真正差异不在写得快，而在先研究透再写。",
            differences: ["对比信号-M9"],
            opportunities: ["把研究层前置"],
            risks: ["只平铺素材会继续空洞"],
          },
        ],
        intersectionInsights: [
          {
            insight: "交汇判断-Z3 表明真正拉开差距的是研究层先行，而不是写作速度。",
            whyNow: "因为 2026 年开始，普通素材拼接已经不够用。",
            caution: "不要把表象当成结论。",
          },
        ],
        strategyWriteback: {
          targetReader: "内容团队负责人",
          coreAssertion: "研究折返点-K47 让写作系统从拼素材，转成拼判断链。",
          whyNow: "现在值得写，是因为对比信号-M9 已经把差异拉开。",
          researchHypothesis: "只要研究层先行，正文质量会明显提高。",
          marketPositionInsight: "对比信号-M9 代表的是研究型工作流相对流水线写作的优势。",
          historicalTurningPoint: "研究折返点-K47",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();
  const generatedJson = await generated.json();
  const markdown = String(generatedJson.data.markdownContent || "");
  expect(markdown).toContain("E2E 研究驱动正文");
  expect(markdown).toMatch(/研究折返点-K47|对比信号-M9|交汇判断-Z3/);
});

test("generate routes block正文 generation when research source coverage is still blocked", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究门槛拦截",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "当前只有单一官方口径，远远不够支撑判断型正文。",
        coreQuestion: "为什么只有单一口径时不应该直接生成正文？",
        sourceCoverage: {
          official: ["官网公告：只确认了官方说法"],
          industry: [],
          comparison: [],
          userVoice: [],
          timeline: [],
          sufficiency: "blocked",
          missingCategories: ["行业源", "同类源", "用户源", "时间源"],
          note: "现在更像观点草稿，不适合直接写硬判断。",
        },
        timelineCards: [
          {
            phase: "当前",
            title: "只有单一口径",
            summary: "目前还停留在官方单边叙述，没有足够外部交叉验证。",
            signals: ["只有单一官方口径"],
          },
        ],
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeFalsy();
  expect(generated.status()).toBe(409);
  const generatedJson = await generated.json();
  expect(String(generatedJson.error || "")).toContain("研究简报的信源覆盖仍不足");

  const streamed = await request.get(`${baseURL}/api/articles/${articleId}/generate/stream`, {
    headers: { Cookie: cookie },
  });
  expect(streamed.ok()).toBeFalsy();
  expect(streamed.status()).toBe(409);
  const streamedJson = await streamed.json();
  expect(String(streamedJson.error || "")).toContain("研究简报的信源覆盖仍不足");

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "researchBrief")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "researchHollowRisk")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "researchSourceCoverage")?.status).toBe("blocked");
  expect(checks.find((item) => item.key === "researchTimeline")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "researchComparison")?.status).toBe("warning");
  expect(checks.find((item) => item.key === "researchIntersection")?.status).toBe("warning");
});

test("publish guard warns on one-sided evidence and clears after counter evidence is saved", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 反证守卫稿件",
  });

  const supportOnlySaved = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方流程说明",
          excerpt: "官方说明写明，核查、润色和发布守门已经合并到一条交付链路。",
          sourceType: "url",
          sourceUrl: "https://example.com/official-workflow",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "阶段升级节点",
          excerpt: "2026 年之后，团队开始把返工问题前置到核查阶段处理。",
          sourceType: "manual",
          researchTag: "turningPoint",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "竞品对比观察",
          excerpt: "对比其他内容工具，这套流程把发布返工压到了最后一步之前。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
      ],
    },
  });
  expect(supportOnlySaved.ok()).toBeTruthy();
  const supportOnlyJson = await supportOnlySaved.json();
  expect(String(supportOnlyJson.data?.[0]?.evidenceRole || "")).toBe("supportingEvidence");
  expect(String(supportOnlyJson.data?.[0]?.researchTag || "")).toBe("timeline");

  const supportOnlyPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(supportOnlyPreview.ok()).toBeTruthy();
  const supportOnlyPreviewJson = await supportOnlyPreview.json();
  let checks = supportOnlyPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "counterEvidence")?.status).toBe("warning");

  const counterSaved = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方流程说明",
          excerpt: "官方说明写明，核查、润色和发布守门已经合并到一条交付链路。",
          sourceType: "url",
          sourceUrl: "https://example.com/official-workflow",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "阶段升级节点",
          excerpt: "2026 年之后，团队开始把返工问题前置到核查阶段处理。",
          sourceType: "manual",
          researchTag: "turningPoint",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "竞品对比观察",
          excerpt: "对比其他内容工具，这套流程把发布返工压到了最后一步之前。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "社区反例反馈",
          excerpt: "也有团队反馈，如果底层素材没整理好，返工还是会在发布前集中爆发。",
          sourceType: "url",
          sourceUrl: "https://community.example.com/workflow-thread",
          researchTag: "contradiction",
          evidenceRole: "counterEvidence",
        },
      ],
    },
  });
  expect(counterSaved.ok()).toBeTruthy();

  const counterPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(counterPreview.ok()).toBeTruthy();
  const counterPreviewJson = await counterPreview.json();
  checks = counterPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "counterEvidence")?.status).toBe("passed");
});

test("research evidence apply endpoint can clear counter evidence guard warning", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 研究写回反证闭环",
  });

  const supportOnlySaved = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方流程说明",
          excerpt: "官方说明写明，核查、润色和发布守门已经合并到一条交付链路。",
          sourceType: "url",
          sourceUrl: "https://example.com/official-workflow",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "阶段升级节点",
          excerpt: "2026 年之后，团队开始把返工问题前置到核查阶段处理。",
          sourceType: "manual",
          researchTag: "turningPoint",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "竞品对比观察",
          excerpt: "对比其他内容工具，这套流程把发布返工压到了最后一步之前。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
      ],
    },
  });
  expect(supportOnlySaved.ok()).toBeTruthy();

  const warningPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(warningPreview.ok()).toBeTruthy();
  let warningPreviewJson = await warningPreview.json();
  let checks = warningPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "counterEvidence")?.status).toBe("warning");

  const factCheckPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究层建议补入反证，避免发布前只剩支持性材料。",
        evidenceCards: [
          {
            claim: "发布守卫应当检查是否缺少反证。",
            supportLevel: "strong",
            supportingEvidence: [
              {
                title: "研究支持证据",
                excerpt: "研究结论表明，只有支持性证据时，发布守卫应该继续提醒。",
                sourceType: "manual",
                sourceUrl: "",
                rationale: "说明补反证前的风险状态。",
                researchTag: "timeline",
                evidenceRole: "supportingEvidence",
              },
            ],
            counterEvidence: [
              {
                title: "研究反证写回",
                excerpt: "也有团队反馈，如果底层素材没整理好，返工还是会在发布前集中爆发。",
                sourceType: "url",
                sourceUrl: "https://community.example.com/workflow-thread",
                rationale: "这条反证会通过 research apply 接口写回证据包。",
                researchTag: "contradiction",
                evidenceRole: "counterEvidence",
              },
            ],
          },
        ],
      },
    },
  });
  expect(factCheckPatched.ok()).toBeTruthy();

  const evidenceWriteback = await request.post(`${baseURL}/api/articles/${articleId}/evidence/apply-research`, {
    headers: { Cookie: cookie },
  });
  expect(evidenceWriteback.ok()).toBeTruthy();
  const evidenceWritebackJson = await evidenceWriteback.json();
  expect(Number(evidenceWritebackJson.data?.appendedCount || 0)).toBeGreaterThan(0);
  expect(Number(evidenceWritebackJson.data?.counterEvidenceCount || 0)).toBeGreaterThan(0);

  const passedPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(passedPreview.ok()).toBeTruthy();
  warningPreviewJson = await passedPreview.json();
  checks = warningPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "counterEvidence")?.status).toBe("passed");
});

test("publish guard style consistency layer reacts to prose breathing and callback fixes", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId, selectedTitle } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 风格一致性守卫",
  });

  const rigidDraft = await request.put(`${baseURL}/api/articles/${articleId}/draft`, {
    headers: { Cookie: cookie },
    data: {
      title: selectedTitle,
      markdownContent: [
        "这篇文章讨论内容团队如何优化写作流程并提升交付效率，因此我们需要先说明系统背景以及流程配置的重要性。这个过程要求团队在多个阶段保持信息一致并严格执行标准步骤，从而保证整体流程稳定运行。",
        "",
        "接下来需要说明核查环节的重要性以及它如何帮助团队减少错误和返工，同时让写作和发布保持稳定衔接。团队在执行时会依赖既定规则推进，因此文章表达也会自然趋于均匀和标准。",
        "",
        "然后要继续解释封面选择、语言整理和发布预检之间的关系，以便证明一体化流程确实能够改善最终交付质量。整个说明过程强调完整性和准确性，但仍然主要停留在说明层面。",
        "",
        "最后补充发布守卫会统一检查各个阶段是否准备完成，并在确认之后再进入后续动作。这样就能减少额外返工并提升协作效率。",
      ].join("\n"),
      status: "ready",
    },
  });
  expect(rigidDraft.ok()).toBeTruthy();

  const rigidPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(rigidPreview.ok()).toBeTruthy();
  const rigidPreviewJson = await rigidPreview.json();
  const rigidLayer = (rigidPreviewJson.data.publishGuard.qualityPanel.layers as Array<{
    code: string;
    issues: string[];
  }>).find((item) => item.code === "style_consistency");
  expect(rigidLayer).toBeTruthy();
  expect(rigidLayer?.issues.some((item) => item.includes("句长变化偏弱"))).toBeTruthy();
  expect(rigidLayer?.issues.some((item) => item.includes("断裂段"))).toBeTruthy();
  expect(rigidLayer?.issues.some((item) => item.includes("回扣动作"))).toBeTruthy();
  expect(rigidLayer?.issues.some((item) => item.includes("口语密度偏低"))).toBeTruthy();

  const improvedDraft = await request.put(`${baseURL}/api/articles/${articleId}/draft`, {
    headers: { Cookie: cookie },
    data: {
      title: selectedTitle,
      markdownContent: [
        "内容团队最怕的，不是不会写。",
        "",
        "是每次都在最后一公里返工。你会发现，真正拖慢交付的往往不是生成速度，而是核查、改写、封面和发布守门没有在同一条链上咬住。前面看着都在推进，最后却一起堵住。",
        "",
        "但问题是，只把流程写对还不够。你得把关键判断压出来，再给它事实锚点，不然整篇就会滑回说明书。说白了，读者不是来看你复述流程图的，是来看你到底看见了什么代价、哪一步最容易失手。",
        "",
        "说回开头，那种返工感为什么总在最后爆出来？因为前面的核查没有真正把风险掐掉，封面和发布预检也只是排队等结果，没有提前把问题拎出来。",
        "",
        "所以最后的动作应该很直接：先把风险前置，再去发。",
      ].join("\n"),
      status: "ready",
    },
  });
  expect(improvedDraft.ok()).toBeTruthy();

  const improvedPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(improvedPreview.ok()).toBeTruthy();
  const improvedPreviewJson = await improvedPreview.json();
  const improvedLayer = (improvedPreviewJson.data.publishGuard.qualityPanel.layers as Array<{
    code: string;
    issues: string[];
  }>).find((item) => item.code === "style_consistency");
  expect(improvedLayer).toBeTruthy();
  expect(improvedLayer?.issues.some((item) => item.includes("句长变化偏弱"))).toBeFalsy();
  expect(improvedLayer?.issues.some((item) => item.includes("断裂段"))).toBeFalsy();
  expect(improvedLayer?.issues.some((item) => item.includes("回扣动作"))).toBeFalsy();
  expect(improvedLayer?.issues.some((item) => item.includes("口语密度偏低"))).toBeFalsy();
});

test("publish guard humanity layer and human signal check react to saved human only signals", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  const { articleId } = await createDeepWritingReadyArticle(baseURL!, request, cookie, {
    title: "E2E 活人感守卫",
  });

  const strategyWithoutHumanSignals = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: "内容团队负责人",
      coreAssertion: "状态驱动写作的关键不是更复杂的大纲，而是更真实的作者输入。",
      whyNow: "因为现在很多稿子已经不缺结构，只缺真实观察和个人判断。",
      targetPackage: "高完成度判断文",
      publishWindow: "48h",
      endingAction: "先把真实信号补进去，再继续生成。",
    },
  });
  expect(strategyWithoutHumanSignals.ok()).toBeTruthy();

  const blockedPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(blockedPreview.ok()).toBeTruthy();
  const blockedPreviewJson = await blockedPreview.json();
  const blockedChecks = blockedPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(blockedChecks.find((item) => item.key === "humanSignals")?.status).toBe("blocked");
  const blockedHumanityLayer = (blockedPreviewJson.data.publishGuard.qualityPanel.layers as Array<{
    code: string;
    status: string;
    issues: string[];
  }>).find((item) => item.code === "humanity");
  expect(blockedHumanityLayer).toBeTruthy();
  expect(String(blockedHumanityLayer?.status || "")).toBe("blocked");
  expect(blockedHumanityLayer?.issues.some((item) => item.includes("当前只补了 0 / 6 条人类信号"))).toBeTruthy();
  expect(blockedHumanityLayer?.issues.some((item) => item.includes("缺第一手观察或真实场景"))).toBeTruthy();
  expect(blockedHumanityLayer?.issues.some((item) => item.includes("缺不能交给 AI 编的真话"))).toBeTruthy();

  const strategyWithHumanSignals = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: "内容团队负责人",
      coreAssertion: "状态驱动写作的关键不是更复杂的大纲，而是更真实的作者输入。",
      whyNow: "因为现在很多稿子已经不缺结构，只缺真实观察和个人判断。",
      targetPackage: "高完成度判断文",
      publishWindow: "48h",
      endingAction: "先把真实信号补进去，再继续生成。",
      firstHandObservation: "我最近连续看了十几篇流程写对但完全没有作者感的稿子，最大问题都出在没有真实观察。",
      realSceneOrDialogue: "有位编辑直接说过一句话：这篇没错，但我完全记不住是谁写的。",
      nonDelegableTruth: "这类稿子最危险的地方，是它看起来像完成了，其实根本没有作者本人站出来。",
    },
  });
  expect(strategyWithHumanSignals.ok()).toBeTruthy();

  const improvedPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(improvedPreview.ok()).toBeTruthy();
  const improvedPreviewJson = await improvedPreview.json();
  const improvedChecks = improvedPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(improvedChecks.find((item) => item.key === "humanSignals")?.status).toBe("passed");
  const improvedHumanityLayer = (improvedPreviewJson.data.publishGuard.qualityPanel.layers as Array<{
    code: string;
    issues: string[];
  }>).find((item) => item.code === "humanity");
  expect(improvedHumanityLayer).toBeTruthy();
  expect(improvedHumanityLayer?.issues.some((item) => item.includes("当前只补了 0 / 6 条人类信号"))).toBeFalsy();
  expect(improvedHumanityLayer?.issues.some((item) => item.includes("缺第一手观察或真实场景"))).toBeFalsy();
  expect(improvedHumanityLayer?.issues.some((item) => item.includes("缺不能交给 AI 编的真话"))).toBeFalsy();
});

test("publish guard aggregates research hollow risk and clears after insight and counter evidence are added", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 内容空洞风险守卫",
  });

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "研究层有时间脉络和横向比较，但还没有交汇洞察。",
        coreQuestion: "为什么没有交汇洞察时，发布守卫应该明确提示内容空洞风险？",
        sourceCoverage: {
          official: ["官方说明"],
          industry: ["行业观察"],
          comparison: ["同类对比"],
          userVoice: ["用户反馈"],
          timeline: ["时间节点"],
          sufficiency: "ready",
          missingCategories: [],
          note: "基础覆盖足够，但判断层还没压出最终洞察。",
        },
        timelineCards: [
          {
            phase: "转折点",
            title: "研究阶段起点",
            summary: "内容团队开始把研究放到写作之前，但还没形成最终交汇判断。",
            signals: ["研究阶段起点"],
          },
        ],
        comparisonCards: [
          {
            subject: "普通素材流",
            position: "真正差异在于有没有把比较结果压成可写的结构判断。",
            differences: ["只做横向列举还不够"],
          },
        ],
        intersectionInsights: [],
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const supportOnlySaved = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方说明",
          excerpt: "研究阶段前置后，选题判断会更稳，但目前这篇还没压出最后洞察。",
          sourceType: "url",
          sourceUrl: "https://example.com/research-stage",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "行业观察",
          excerpt: "多数流程只做到资料整理，没有把比较和历史变化真正交汇起来。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "用户反馈",
          excerpt: "读者能感觉到资料很多，但还是说不清为什么今天值得写。",
          sourceType: "manual",
          researchTag: "userVoice",
          evidenceRole: "supportingEvidence",
        },
      ],
    },
  });
  expect(supportOnlySaved.ok()).toBeTruthy();

  const warningPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(warningPreview.ok()).toBeTruthy();
  const warningPreviewJson = await warningPreview.json();
  let checks = warningPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string; detail?: string }>;
  const hollowRiskWarning = checks.find((item) => item.key === "researchHollowRisk");
  expect(hollowRiskWarning?.status).toBe("warning");
  expect(String(hollowRiskWarning?.detail || "")).toContain("高风险：缺少交汇洞察");
  expect(String(hollowRiskWarning?.detail || "")).toContain("只有支持性证据");

  const researchCompleted = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        intersectionInsights: [
          {
            insight: "真正的分水岭不是研究做没做，而是有没有把历史和比较压成 why now 级别的最终判断。",
            whyNow: "因为没有这层交汇洞察，正文就只是在转述素材。",
            support: ["研究层的最终产物应该是判断，不是资料堆叠。"],
            caution: "不能把比较素材直接当成结论。",
          },
        ],
      },
    },
  });
  expect(researchCompleted.ok()).toBeTruthy();

  const counterSaved = await request.put(`${baseURL}/api/articles/${articleId}/evidence`, {
    headers: { Cookie: cookie },
    data: {
      items: [
        {
          title: "官方说明",
          excerpt: "研究阶段前置后，选题判断会更稳，但目前这篇还没压出最后洞察。",
          sourceType: "url",
          sourceUrl: "https://example.com/research-stage",
          researchTag: "timeline",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "行业观察",
          excerpt: "多数流程只做到资料整理，没有把比较和历史变化真正交汇起来。",
          sourceType: "manual",
          researchTag: "competitor",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "用户反馈",
          excerpt: "读者能感觉到资料很多，但还是说不清为什么今天值得写。",
          sourceType: "manual",
          researchTag: "userVoice",
          evidenceRole: "supportingEvidence",
        },
        {
          title: "反向样本",
          excerpt: "也有内容团队指出，如果补了交汇洞察和反证，正文会明显更难滑向空洞结论。",
          sourceType: "url",
          sourceUrl: "https://example.com/research-counter",
          researchTag: "contradiction",
          evidenceRole: "counterEvidence",
        },
      ],
    },
  });
  expect(counterSaved.ok()).toBeTruthy();

  const passedPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(passedPreview.ok()).toBeTruthy();
  const passedPreviewJson = await passedPreview.json();
  checks = passedPreviewJson.data.publishGuard.checks as Array<{ key: string; status: string; detail?: string }>;
  const hollowRiskPassed = checks.find((item) => item.key === "researchHollowRisk");
  expect(hollowRiskPassed?.status).toBe("passed");
  expect(String(hollowRiskPassed?.detail || "")).toContain("内容空洞风险可控");
});

test("writer workflow can apply fact check and prose polish artifacts back to article draft", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 核查润色闭环稿件",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "核查润色素材",
      content: "2026 年，越来越多公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线，以减少空话、误引和发布返工。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const audience = await request.post(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
  });
  expect(audience.ok()).toBeTruthy();
  const audienceJson = await audience.json();
  const audienceSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/audienceAnalysis`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedReaderLabel: String(audienceJson.data.payload?.readerSegments?.[0]?.label || "").trim() || null,
          selectedLanguageGuidance: String(audienceJson.data.payload?.languageGuidance?.[0] || "").trim() || null,
          selectedBackgroundAwareness: String(audienceJson.data.payload?.backgroundAwarenessOptions?.[0] || "").trim() || null,
          selectedReadabilityLevel: String(audienceJson.data.payload?.readabilityOptions?.[0] || "").trim() || null,
          selectedCallToAction: String(audienceJson.data.payload?.recommendedCallToAction || "").trim() || "结尾给出执行建议。",
        },
      },
    },
  });
  expect(audienceSave.ok()).toBeTruthy();

  const outline = await request.post(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
  });
  expect(outline.ok()).toBeTruthy();
  const outlineJson = await outline.json();
  const selectedTitle = String(outlineJson.data.payload?.titleOptions?.[0]?.title || outlineJson.data.payload?.workingTitle || "E2E 核查润色闭环稿件").trim();
  const outlineSave = await request.patch(`${baseURL}/api/articles/${articleId}/stages/outlinePlanning`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        selection: {
          selectedTitle,
          selectedTitleStyle: String(outlineJson.data.payload?.titleOptions?.[0]?.styleLabel || "").trim() || null,
          selectedOpeningHook: String(outlineJson.data.payload?.openingHookOptions?.[0] || outlineJson.data.payload?.openingHook || "").trim() || null,
          selectedTargetEmotion: String(outlineJson.data.payload?.targetEmotionOptions?.[0] || outlineJson.data.payload?.targetEmotion || "").trim() || null,
          selectedEndingStrategy: String(outlineJson.data.payload?.endingStrategyOptions?.[0] || outlineJson.data.payload?.endingStrategy || "").trim() || null,
        },
      },
    },
  });
  expect(outlineSave.ok()).toBeTruthy();

  const deepWriting = await request.post(`${baseURL}/api/articles/${articleId}/stages/deepWriting`, {
    headers: { Cookie: cookie },
  });
  expect(deepWriting.ok()).toBeTruthy();

  const generated = await request.post(`${baseURL}/api/articles/${articleId}/generate`, {
    headers: { Cookie: cookie },
  });
  expect(generated.ok()).toBeTruthy();

  const factCheck = await request.post(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
  });
  expect(factCheck.ok()).toBeTruthy();

  const factCheckPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/factCheck`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "关键事实表述已经收敛为稳妥口径。",
        overallRisk: "low",
        checks: [
          {
            claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
            status: "verified",
            suggestion: "保留这条表述。",
          },
          {
            claim: "这能减少空话、误引和发布返工。",
            status: "opinion",
            suggestion: "保留判断语气，不要写成绝对结论。",
          },
        ],
        evidenceCards: [
          {
            claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
            supportLevel: "strong",
            evidenceItems: [
              {
                title: "核查润色素材",
                excerpt: "越来越多公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
                sourceType: "manual",
                sourceUrl: null,
                rationale: "来自当前已采集素材，可支持正文主张。",
              },
            ],
          },
        ],
        missingEvidence: [],
        personaAlignment: "当前正文与作者人设一致。",
        topicAlignment: "当前正文与主题主轴一致。",
        selection: {
          claimDecisions: [
            {
              claim: "公众号作者开始把事实核查、语言守卫和排版模板放进同一条写作流水线。",
              action: "keep",
              note: "保留事实表达。",
            },
          ],
        },
      },
    },
  });
  expect(factCheckPatched.ok()).toBeTruthy();

  const factCheckApplied = await request.post(`${baseURL}/api/articles/${articleId}/stages/factCheck/apply`, {
    headers: { Cookie: cookie },
  });
  expect(factCheckApplied.ok()).toBeTruthy();
  const factCheckAppliedJson = await factCheckApplied.json();
  expect(String(factCheckAppliedJson.data.stageCode || "")).toBe("factCheck");
  expect(String(factCheckAppliedJson.data.applyMode || "")).toBe("targeted");
  expect(String(factCheckAppliedJson.data.markdownContent || "")).toContain(selectedTitle);

  const prosePolish = await request.post(`${baseURL}/api/articles/${articleId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
  });
  expect(prosePolish.ok()).toBeTruthy();

  const prosePolishPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/prosePolish`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "语言节奏已经更紧，开头抓力更强。",
        overallDiagnosis: "信息密度成立，但首段还可以更直接。",
        strengths: ["信息密度够高", "判断句比较集中"],
        issues: [
          {
            type: "开头发力不足",
            example: "第一段进入判断稍慢。",
            suggestion: "先抛出结论，再解释为什么公众号作者要把核查与排版绑在一起。",
          },
        ],
        rewrittenLead: "真正拖慢公众号写作的，不是不会生成，而是每次都要在事实、语气和排版之间来回返工。",
        punchlines: ["把核查、语言守卫和排版拆开，返工就会回来。"],
        rhythmAdvice: ["第二段改短句", "结尾保留一个判断句做收束"],
      },
    },
  });
  expect(prosePolishPatched.ok()).toBeTruthy();

  const prosePolishApplied = await request.post(`${baseURL}/api/articles/${articleId}/stages/prosePolish/apply`, {
    headers: { Cookie: cookie },
  });
  expect(prosePolishApplied.ok()).toBeTruthy();
  const prosePolishAppliedJson = await prosePolishApplied.json();
  expect(String(prosePolishAppliedJson.data.stageCode || "")).toBe("prosePolish");
  expect(String(prosePolishAppliedJson.data.applyMode || "")).toBe("targeted");
  expect(String(prosePolishAppliedJson.data.markdownContent || "")).toContain("公众号");

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "alignment")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "prosePolish")?.status).toBe("passed");
});

test("research brief apply prefers persisted strategy research fields", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 研究简报应用优先级",
  });

  const capture = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "研究应用素材",
      content: "内容工作流真正的分水岭，不只在写作速度，还在有没有把研究判断先压成明确的结构锚点。",
  });
  expect(Number(capture?.id || 0)).toBeGreaterThan(0);

  const researchPatched = await request.patch(`${baseURL}/api/articles/${articleId}/stages/researchBrief`, {
    headers: { Cookie: cookie },
    data: {
      payloadPatch: {
        summary: "先有旧默认值，后续再由策略卡覆盖。",
        coreQuestion: "为什么 researchBrief apply 也要遵守策略卡优先级？",
        timelineCards: [
          {
            phase: "旧默认",
            title: "OLD_APPLY_TURNING_POINT",
            summary: "OLD_APPLY_TURNING_POINT 只是 researchBrief 的默认历史切口。",
            signals: ["OLD_APPLY_TURNING_POINT"],
          },
        ],
        comparisonCards: [
          {
            subject: "OLD_APPLY_MARKET",
            position: "OLD_APPLY_MARKET 只是 researchBrief 的默认位置判断。",
            differences: ["OLD_APPLY_MARKET"],
          },
        ],
        intersectionInsights: [
          {
            insight: "OLD_APPLY_ASSERTION 只是旧默认主判断。",
            whyNow: "旧默认 why now。",
          },
        ],
        strategyWriteback: {
          targetReader: "旧默认读者",
          coreAssertion: "OLD_APPLY_ASSERTION",
          whyNow: "OLD_APPLY_WHY_NOW",
          researchHypothesis: "OLD_APPLY_HYPOTHESIS",
          marketPositionInsight: "OLD_APPLY_MARKET",
          historicalTurningPoint: "OLD_APPLY_TURNING_POINT",
        },
      },
    },
  });
  expect(researchPatched.ok()).toBeTruthy();

  const strategySaved = await request.put(`${baseURL}/api/articles/${articleId}/strategy`, {
    headers: { Cookie: cookie },
    data: {
      targetReader: "APPLY_TARGET_READER_QX9",
      coreAssertion: "APPLY_CORE_ASSERTION_QX9",
      whyNow: "APPLY_WHY_NOW_QX9",
      researchHypothesis: "APPLY_RESEARCH_HYPOTHESIS_QX9",
      marketPositionInsight: "APPLY_MARKET_POSITION_QX9",
      historicalTurningPoint: "APPLY_TURNING_POINT_QX9",
      endingAction: "先把研究判断写硬。",
    },
  });
  expect(strategySaved.ok()).toBeTruthy();

  const applied = await request.post(`${baseURL}/api/articles/${articleId}/stages/researchBrief/apply`, {
    headers: { Cookie: cookie },
  });
  expect(applied.ok()).toBeTruthy();
  const appliedJson = await applied.json();
  expect(String(appliedJson.data.stageCode || "")).toBe("researchBrief");
  expect(String(appliedJson.data.applyMode || "")).toBe("rewrite");
  expect(String(appliedJson.data.markdownContent || "")).toMatch(/APPLY_TURNING_POINT_QX9|APPLY_MARKET_POSITION_QX9|APPLY_CORE_ASSERTION_QX9/);
});

test("settings page exposes workspace asset center summary", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const response = await request.get(`${baseURL}/settings`, {
    headers: { Cookie: cookie },
  });
  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain("资产中心");
  expect(html).toContain("资产状态");
  expect(html).toContain("待处理事项");
  expect(html).toContain("最近沉淀");
  expect(html).toContain("图片资产空间");
});

test("workspace asset pages expose knowledge cards and image assets", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);

  const fragmentOne = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "知识卡碎片 A",
      content: "AI 团队正在把事实核查、风格润色和发布守门合并成统一流程，以减少公众号返工。",
  });
  expect(Number(fragmentOne?.id || 0)).toBeGreaterThan(0);

  const fragmentTwo = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "知识卡碎片 B",
      content: "当选题、证据和发布连接不在一个闭环里时，创作者会在最后一公里反复返工。",
  });
  expect(Number(fragmentTwo?.id || 0)).toBeGreaterThan(0);

  const compiled = await compileKnowledgeCardForTest(baseURL!, request, cookie);
  const knowledgeTitle = String(compiled?.title || "");
  expect(knowledgeTitle).not.toBe("");

  const listedKnowledgeCards = await listKnowledgeCardsForTest(baseURL!, request, cookie);
  expect(Array.isArray(listedKnowledgeCards)).toBeTruthy();
  expect(JSON.stringify(listedKnowledgeCards)).not.toContain("workspaceScope");
  expect(JSON.stringify(listedKnowledgeCards)).not.toContain("workspace_scope");

  const opsKnowledgeCards = await request.get(`${baseURL}/api/ops/knowledge/cards`, {
    headers: { Cookie: cookie },
  });
  expect(opsKnowledgeCards.ok()).toBeTruthy();
  const opsKnowledgeCardsJson = await opsKnowledgeCards.json();
  expect(Array.isArray(opsKnowledgeCardsJson.data)).toBeTruthy();
  expect(JSON.stringify(opsKnowledgeCardsJson.data)).not.toContain("workspaceScope");
  expect(JSON.stringify(opsKnowledgeCardsJson.data)).not.toContain("workspace_scope");

  const { selectedTitle } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 图片资产页稿件",
  });

  const settingsPage = await request.get(`${baseURL}/settings`, {
    headers: { Cookie: cookie },
  });
  expect(settingsPage.ok()).toBeTruthy();
  const settingsHtml = await settingsPage.text();
  expect(settingsHtml).toContain("资产中心");
  expect(settingsHtml).toContain("主题档案");
  expect(settingsHtml).toContain(knowledgeTitle);
  expect(settingsHtml).toContain("图片资产");
  expect(settingsHtml).toContain("图片资产空间");
  expect(settingsHtml).toContain(selectedTitle);
  expect(settingsHtml).not.toContain("共享范围");
  expect(settingsHtml).not.toContain("个人作用域");
});

test("settings page exposes personal asset and connection entries", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);
  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);

  const fragment = await createManualFragmentForTest(baseURL!, request, cookie, {
      title: "E2E 碎片资产",
      content: "这是一条用于验证个人空间碎片页的素材输入。",
  });
  expect(Number(fragment?.id || 0)).toBeGreaterThan(0);

  const settingsPage = await request.get(`${baseURL}/settings`, {
    headers: { Cookie: cookie },
  });
  expect(settingsPage.ok()).toBeTruthy();
  const settingsHtml = await settingsPage.text();
  expect(settingsHtml).toContain("资产中心");
  expect(settingsHtml).toContain("发布连接");
  expect(settingsHtml).toContain("E2E 碎片资产");
  expect(settingsHtml).toContain(String(connection.accountName || "Mock 微信公众号"));
});

test("service scheduler topic sync route supports idempotent window trigger", async ({ request, baseURL }) => {
  const response = await request.post(`${baseURL}/api/service/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 6,
      force: true,
    },
  });
  expect(response.ok()).toBeTruthy();

  const json = await response.json();
  expect(typeof json.data.windowLabel).toBe("string");
  expect(String(json.data.windowLabel)).toContain("北京时间");
  expect(typeof json.data.syncWindowStart).toBe("string");
  expect(json.data.scheduledSourceCount).toBeGreaterThanOrEqual(0);
});

test("service scheduler topic sync route supports compensation retry windows", async ({ request, baseURL }) => {
  const response1815 = await request.post(`${baseURL}/api/service/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 18,
      windowMinute: 15,
      force: true,
    },
  });
  expect(response1815.ok()).toBeTruthy();

  const json1815 = await response1815.json();
  expect(String(json1815.data.windowLabel)).toContain("补偿窗口");
  expect(String(json1815.data.windowLabel)).toContain("18:15");
  expect(String(json1815.data.syncWindowStart)).toContain("T18:15:00+08:00");

  const response0645 = await request.post(`${baseURL}/api/service/scheduler/topic-sync`, {
    headers: {
      Authorization: "Bearer change_me_to_a_random_64_char_secret",
    },
    data: {
      limitPerSource: 0,
      windowHour: 6,
      windowMinute: 45,
      force: true,
    },
  });
  expect(response0645.ok()).toBeTruthy();

  const json0645 = await response0645.json();
  expect(String(json0645.data.windowLabel)).toContain("补偿窗口");
  expect(String(json0645.data.windowLabel)).toContain("06:45");
  expect(String(json0645.data.syncWindowStart)).toContain("T06:45:00+08:00");
});

test("ops topic source sync records failures and supports retry window", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  const sourceName = `E2E 失败信源 ${Date.now()}`;

  const created = await request.post(`${baseURL}/api/ops/topic-sources`, {
    headers: { Cookie: cookie },
    data: {
      name: sourceName,
      homepageUrl: "http://127.0.0.1:1/e2e-topic-sync-fail",
      sourceType: "news",
      priority: 1,
    },
  });
  expect(created.ok()).toBeTruthy();

  const listed = await request.get(`${baseURL}/api/ops/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();
  const listedJson = await listed.json();
  const source = (Array.isArray(listedJson.data) ? listedJson.data : []).find((item: { name?: string }) => item.name === sourceName);
  expect(source).toBeTruthy();

  const synced = await request.post(`${baseURL}/api/ops/topic-sources/${source.id}/sync`, {
    headers: { Cookie: cookie },
    data: {
      limitPerSource: 1,
    },
  });
  expect(synced.ok()).toBeTruthy();
  const syncedJson = await synced.json();
  expect(String(syncedJson.data.status || "")).toBe("failed");
  expect(Number(syncedJson.data.failedSourceCount || 0)).toBe(1);
  expect(Number(syncedJson.data.runId || 0)).toBeGreaterThan(0);

  const listedAfterFailure = await request.get(`${baseURL}/api/ops/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listedAfterFailure.ok()).toBeTruthy();
  const listedAfterFailureJson = await listedAfterFailure.json();
  const failedSource = (Array.isArray(listedAfterFailureJson.data) ? listedAfterFailureJson.data : []).find(
    (item: { name?: string }) => item.name === sourceName,
  );
  expect(failedSource).toBeTruthy();
  expect(String(failedSource.status || "")).toBe("degraded");
  expect(Number(failedSource.attemptCount || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(failedSource.consecutiveFailures || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(failedSource.healthScore || 0)).toBeLessThan(100);
  expect(String(failedSource.lastError || "")).not.toBe("");
  expect(String(failedSource.degradedReason || "")).not.toBe("");
  expect(failedSource.nextRetryAt).toBeTruthy();

  const retried = await request.post(`${baseURL}/api/ops/topic-sync/${syncedJson.data.runId}/retry`, {
    headers: { Cookie: cookie },
    data: {
      limitPerSource: 1,
    },
  });
  expect(retried.ok()).toBeTruthy();
  const retriedJson = await retried.json();
  expect(Number(retriedJson.data.retriedSourceCount || 0)).toBeGreaterThanOrEqual(1);
  expect(Number(retriedJson.data.failedSourceCount || 0)).toBeGreaterThanOrEqual(1);
});

test("ops seeded topic sources cover first-wave source types", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);

  const listed = await request.get(`${baseURL}/api/ops/topic-sources`, {
    headers: { Cookie: cookie },
  });
  expect(listed.ok()).toBeTruthy();

  const listedJson = await listed.json();
  const systemSources = (Array.isArray(listedJson.data) ? listedJson.data : []).filter(
    (item: { connectorScope?: string | null }) => (item.connectorScope ?? "system") === "system",
  );
  const sourceTypes = new Set(
    systemSources.map((item: { sourceType?: string | null }) => String(item.sourceType || "news").toLowerCase()),
  );

  expect(sourceTypes.has("youtube")).toBeTruthy();
  expect(sourceTypes.has("reddit")).toBeTruthy();
  expect(sourceTypes.has("podcast")).toBeTruthy();
  expect(sourceTypes.has("spotify")).toBeTruthy();
  expect(sourceTypes.has("rss")).toBeTruthy();
  expect(sourceTypes.has("blog")).toBeTruthy();
  expect(sourceTypes.has("news")).toBeTruthy();
});

test("ops object storage presets can be saved and tested", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);

  const saved = await request.put(`${baseURL}/api/ops/object-storage`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "s3-compatible",
      providerPreset: "cloudflare-r2",
      endpoint: "https://example-account.r2.cloudflarestorage.com",
      bucketName: "huoziwriter-e2e",
      region: "auto",
      accessKeyId: "e2e-access-key",
      secretAccessKey: "e2e-secret-access-key",
      publicBaseUrl: "https://pub-e2e.r2.dev",
      pathPrefix: "e2e/assets",
      isEnabled: false,
    },
  });
  expect(saved.ok()).toBeTruthy();
  const savedJson = await saved.json();
  expect(String(savedJson.data.providerPreset || "")).toBe("cloudflare-r2");
  expect(String(savedJson.data.providerName || "")).toBe("s3-compatible");
  expect(String(savedJson.data.effectiveProvider || "")).toBe("local");

  const loaded = await request.get(`${baseURL}/api/ops/object-storage`, {
    headers: { Cookie: cookie },
  });
  expect(loaded.ok()).toBeTruthy();
  const loadedJson = await loaded.json();
  expect(String(loadedJson.data.providerPreset || "")).toBe("cloudflare-r2");
  expect(String(loadedJson.data.region || "")).toBe("auto");

  const savedAws = await request.put(`${baseURL}/api/ops/object-storage`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "s3-compatible",
      providerPreset: "aws-s3",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucketName: "huoziwriter-e2e",
      region: "us-east-1",
      accessKeyId: "e2e-aws-access-key",
      secretAccessKey: "e2e-aws-secret-key",
      publicBaseUrl: "https://huoziwriter-e2e.s3.us-east-1.amazonaws.com",
      pathPrefix: "wechat/assets",
      isEnabled: false,
    },
  });
  expect(savedAws.ok()).toBeTruthy();
  const savedAwsJson = await savedAws.json();
  expect(String(savedAwsJson.data.providerPreset || "")).toBe("aws-s3");
  expect(String(savedAwsJson.data.region || "")).toBe("us-east-1");

  const loadedAws = await request.get(`${baseURL}/api/ops/object-storage`, {
    headers: { Cookie: cookie },
  });
  expect(loadedAws.ok()).toBeTruthy();
  const loadedAwsJson = await loadedAws.json();
  expect(String(loadedAwsJson.data.providerPreset || "")).toBe("aws-s3");
  expect(String(loadedAwsJson.data.region || "")).toBe("us-east-1");

  const tested = await request.post(`${baseURL}/api/ops/object-storage/test`, {
    headers: { Cookie: cookie },
    data: {
      providerName: "local",
      providerPreset: "local",
      isEnabled: true,
    },
  });
  expect(tested.ok()).toBeTruthy();
  const testedJson = await tested.json();
  expect(String(testedJson.data.provider || "")).toBe("local");
});

test("cover image workflow returns two candidates and can select one into article assets", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 封面图闭环稿件",
  });

  const userId = await getCurrentUserId(baseURL!, request, cookie);
  const generated = await generateCoverCandidatesForTest({
    userId,
    articleId,
    title: "E2E 封面图闭环稿件",
  });
  expect(Array.isArray(generated.candidates)).toBeTruthy();
  expect(generated.candidates).toHaveLength(2);
  expect(String(generated.candidates[0].imageUrl || "")).toContain("/generated-assets/");
  expect(String(generated.candidates[1].imageUrl || "")).toContain("/generated-assets/");
  expect(Number(generated.candidates[0].assetFileId || 0)).toBeGreaterThan(0);
  expect(Number(generated.candidates[1].assetFileId || 0)).toBeGreaterThan(0);
  expect(Number(generated.storageQuota?.usedBytes || 0)).toBeGreaterThan(0);
  expect(Number(generated.storageQuota?.limitBytes || 0)).toBeGreaterThan(0);

  const selected = await selectCoverCandidateForTest({
    userId,
    candidateId: generated.candidates[0].id,
  });
  expect(String(selected.imageUrl || "")).toContain("/generated-assets/");
  expect(Number(selected.assetFileId || 0)).toBeGreaterThan(0);

  const preview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {},
  });
  expect(preview.ok()).toBeTruthy();
  const previewJson = await preview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("passed");
});

test("settings page exposes authoring assets inside the main product flow", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const page = await request.get(`${baseURL}/settings`, {
    headers: { Cookie: cookie },
  });
  expect(page.ok()).toBeTruthy();
  const html = await page.text();
  expect(html).toContain("作者与系列");
  expect(html).toContain("资产中心");
  expect(html).toContain("发布连接");
  expect(html).toContain("账号安全与套餐");
});

test("pricing page only exposes free pro ultra plans without team residue", async ({ request, baseURL }) => {
  const page = await request.get(`${baseURL}/pricing`);
  expect(page.ok()).toBeTruthy();
  const html = await page.text();
  expect(html).toContain("Free");
  expect(html).toContain("Pro");
  expect(html).toContain("Ultra");
  expect(html).not.toContain("team");
  expect(html).not.toContain("Team");
});

test("topic source managers no longer expose X as a configurable source option", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const radarPage = await request.get(`${baseURL}/dashboard`, {
    headers: { Cookie: cookie },
  });
  expect(radarPage.ok()).toBeTruthy();
  const radarHtml = await radarPage.text();
  expect(radarHtml).not.toContain('<option value="x">X</option>');

  const opsPage = await request.get(`${baseURL}/ops`, {
    headers: { Cookie: cookie },
  });
  expect(opsPage.ok()).toBeTruthy();
  const opsHtml = await opsPage.text();
  expect(opsHtml).not.toContain('<option value="x">X</option>');
});

test("wechat publish route can publish to mock draft box when publish guard passes", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);
  await ensureMockImageEngine(baseURL!, request, cookie);
  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);
  const { articleId, selectedTitle } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E Mock 微信发布稿件",
  });

  const publishPreview = await request.post(`${baseURL}/api/articles/${articleId}/publish-preview`, {
    headers: { Cookie: cookie },
    data: {
      wechatConnectionId: connection.id,
    },
  });
  expect(publishPreview.ok()).toBeTruthy();
  const previewJson = await publishPreview.json();
  const checks = previewJson.data.publishGuard.checks as Array<{ key: string; status: string }>;
  expect(checks.find((item) => item.key === "factCheck")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "outlinePlanning")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "deepWriting")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "alignment")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "prosePolish")?.status).toBe("passed");
  expect(checks.find((item) => item.key === "coverImage")?.status).toBe("passed");
  expect(["passed", "warning"]).toContain(String(checks.find((item) => item.key === "wechatConnection")?.status || ""));

  const published = await request.post(`${baseURL}/api/articles/${articleId}/publish`, {
    headers: { Cookie: cookie },
    data: {
      wechatConnectionId: connection.id,
      digest: "E2E mock publish digest",
      author: "Huozi Writer E2E",
    },
  });
  expect(published.ok()).toBeTruthy();
  const publishedJson = await published.json();
  expect(String(publishedJson.data.mediaId || "")).toContain("mock_media_");
});

test("articles scorecard, outcomes and playbooks expose result model data", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);
  const { articleId } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 结果模型稿件",
  });

  const initialScorecard = await request.get(`${baseURL}/api/articles/${articleId}/scorecard`, {
    headers: { Cookie: cookie },
  });
  expect(initialScorecard.ok()).toBeTruthy();
  const initialScorecardJson = await initialScorecard.json();
  expect(String(initialScorecardJson.data.hitStatus || "")).toBe("pending");
  expect(Array.isArray(initialScorecardJson.data.completedWindowCodes)).toBeTruthy();
  expect(Array.isArray(initialScorecardJson.data.missingWindowCodes)).toBeTruthy();
  expect(initialScorecardJson.data.missingWindowCodes).toContain("24h");
  expect(String(initialScorecardJson.data.scorecard?.version || "")).toBe("v1");
  expect(Number(initialScorecardJson.data.scorecard?.predictedScore || 0)).toBeGreaterThan(0);

  const playbookLabel = "反直觉开头";
  const savedOutcome = await request.post(`${baseURL}/api/articles/${articleId}/outcomes/snapshots`, {
    headers: { Cookie: cookie },
    data: {
      windowCode: "24h",
      readCount: 3200,
      shareCount: 180,
      likeCount: 96,
      notes: "首轮回流稳定，读者对开头反应明显更强。",
      targetPackage: "高打开率拆解",
      hitStatus: "hit",
      reviewSummary: "这篇稿件已经命中目标包，主要受益于强判断开头和短句推进。",
      nextAction: "把同样的开头判断结构复用到下一篇选题。",
      playbookTags: [playbookLabel, "短句推进"],
    },
  });
  expect(savedOutcome.ok()).toBeTruthy();
  const savedOutcomeJson = await savedOutcome.json();
  expect(String(savedOutcomeJson.data.outcome?.hitStatus || "")).toBe("hit");
  expect(Array.isArray(savedOutcomeJson.data.completedWindowCodes)).toBeTruthy();
  expect(savedOutcomeJson.data.completedWindowCodes).toContain("24h");

  const outcomes = await request.get(`${baseURL}/api/articles/${articleId}/outcomes`, {
    headers: { Cookie: cookie },
  });
  expect(outcomes.ok()).toBeTruthy();
  const outcomesJson = await outcomes.json();
  expect(String(outcomesJson.data.outcome?.hitStatus || "")).toBe("hit");
  expect(String(outcomesJson.data.outcome?.targetPackage || "")).toBe("高打开率拆解");
  expect(String(outcomesJson.data.outcome?.scorecard?.version || "")).toBe("v1");
  expect(Array.isArray(outcomesJson.data.outcome?.playbookTags)).toBeTruthy();
  expect(outcomesJson.data.outcome.playbookTags).toContain(playbookLabel);
  expect(Array.isArray(outcomesJson.data.snapshots)).toBeTruthy();
  expect(String(outcomesJson.data.snapshots[0]?.windowCode || "")).toBe("24h");
  expect(Number(outcomesJson.data.snapshots[0]?.readCount || 0)).toBe(3200);

  const playbooks = await request.get(`${baseURL}/api/playbooks`, {
    headers: { Cookie: cookie },
  });
  expect(playbooks.ok()).toBeTruthy();
  const playbooksJson = await playbooks.json();
  const matchedPlaybook = (Array.isArray(playbooksJson.data) ? playbooksJson.data : []).find(
    (item: { label?: string }) => item.label === playbookLabel,
  );
  expect(matchedPlaybook).toBeTruthy();
  expect(Number(matchedPlaybook.hitCount || 0)).toBeGreaterThan(0);
});

test("wechat publish can resume after adding missing connection", async ({ request, baseURL }) => {
  const opsCookie = await loginAsOps(baseURL!, request);
  await ensureMockImageEngine(baseURL!, request, opsCookie);
  const user = await createE2EUser(baseURL!, request, opsCookie, {
    planCode: "ultra",
  });
  const cookie = await loginWithPassword(baseURL!, request, {
    username: user.username,
    password: user.password,
  });
  await ensurePersona(baseURL!, request, cookie);
  const templateId = await getFirstOfficialTemplateId(baseURL!, request, cookie);
  const { articleId } = await createPublishReadyArticle(baseURL!, request, cookie, {
    title: "E2E 缺连接后恢复发布",
  });

  const firstPublish = await request.post(`${baseURL}/api/articles/${articleId}/publish`, {
    headers: { Cookie: cookie },
    data: {
      templateId,
    },
  });
  expect(firstPublish.ok()).toBeFalsy();
  const firstPublishJson = await firstPublish.json();
  expect(String(firstPublishJson.data?.code || "")).toBe("connection_missing");

  const pending = await request.get(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(pending.ok()).toBeTruthy();
  const pendingJson = await pending.json();
  expect(String(pendingJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");
  expect(String(pendingJson.data.pendingPublishIntent?.templateId || "")).toBe(templateId);

  const connection = await ensureMockWechatConnection(baseURL!, request, cookie);

  const userId = await getCurrentUserId(baseURL!, request, cookie);
  const preflight = await evaluateArticlePublishGuard({
    articleId,
    userId,
    wechatConnectionId: connection.id,
    templateId,
  });
  expect(Boolean(preflight.canPublish)).toBe(true);
  expect(String(preflight.connectionHealth?.status || "")).toBe("valid");

  const resumed = await request.post(`${baseURL}/api/articles/${articleId}/publish/retry`, {
    headers: { Cookie: cookie },
    data: {
      wechatConnectionId: connection.id,
      templateId,
    },
  });
  expect(resumed.ok()).toBeTruthy();
  const resumedJson = await resumed.json();
  expect(Boolean(resumedJson.data.retried)).toBe(true);
  expect(String(resumedJson.data.mediaId || "")).toContain("mock_media_");

  const reloadedPending = await request.get(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(reloadedPending.ok()).toBeTruthy();
  const reloadedPendingJson = await reloadedPending.json();
  expect(reloadedPendingJson.data.pendingPublishIntent).toBeNull();
});

test("publish intent can be persisted and cleared through workflow state", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 待恢复发布意图",
  });

  const saved = await request.put(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
    data: {
      templateId: "official-essay",
      createdAt: "2026-04-14T10:00:00.000Z",
      reason: "missing_connection",
    },
  });
  expect(saved.ok()).toBeTruthy();
  const savedJson = await saved.json();
  expect(String(savedJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(savedJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");

  const loaded = await request.get(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(loaded.ok()).toBeTruthy();
  const loadedJson = await loaded.json();
  expect(String(loadedJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(loadedJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");

  const cleared = await request.delete(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(cleared.ok()).toBeTruthy();
  const clearedJson = await cleared.json();
  expect(clearedJson.data.pendingPublishIntent).toBeNull();
});

test("wechat publish without connection persists missing-connection intent", async ({ request, baseURL }) => {
  const cookie = await loginAsOps(baseURL!, request);
  await ensurePersona(baseURL!, request, cookie);

  const { articleId } = await createArticleForTest(baseURL!, request, cookie, {
    title: "E2E 缺连接发布意图",
  });

  const publish = await request.post(`${baseURL}/api/articles/${articleId}/publish`, {
    headers: { Cookie: cookie },
    data: {
      templateId: "official-essay",
    },
  });
  expect(publish.ok()).toBeFalsy();
  const publishJson = await publish.json();
  expect(String(publishJson.error || "")).toContain("当前还没有可用公众号连接");
  expect(String(publishJson.data?.code || "")).toBe("connection_missing");

  const pending = await request.get(`${baseURL}/api/articles/${articleId}/publish-intent`, {
    headers: { Cookie: cookie },
  });
  expect(pending.ok()).toBeTruthy();
  const pendingJson = await pending.json();
  expect(String(pendingJson.data.pendingPublishIntent?.templateId || "")).toBe("official-essay");
  expect(String(pendingJson.data.pendingPublishIntent?.reason || "")).toBe("missing_connection");
});
