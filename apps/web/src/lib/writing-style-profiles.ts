import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { getUserPlanContext } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import type { WritingStyleAnalysis } from "./writing-style-analysis";

type WritingStyleProfileRow = {
  id: number;
  user_id: number;
  name: string;
  source_url: string | null;
  source_title: string | null;
  summary: string;
  tone_keywords_json: string | string[];
  structure_patterns_json: string | string[];
  language_habits_json: string | string[];
  opening_patterns_json: string | string[];
  ending_patterns_json: string | string[];
  do_not_write_json: string | string[];
  imitation_prompt: string;
  source_excerpt: string | null;
  analysis_payload_json: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSampleSources(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ url: string; title: string; summary: string; degradedReason: string | null }>;
  return value
    .map((item) => item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null)
    .filter(Boolean)
    .map((item) => ({
      url: String(item?.url || "").trim(),
      title: String(item?.title || "").trim(),
      summary: String(item?.summary || "").trim(),
      degradedReason: String(item?.degradedReason || "").trim() || null,
    }))
    .filter((item) => item.url || item.title || item.summary);
}

function mapWritingStyleProfile(row: WritingStyleProfileRow) {
  const analysis = parseJsonObject(row.analysis_payload_json);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    summary: row.summary,
    toneKeywords: parseJsonArray(row.tone_keywords_json),
    sentenceRhythm: String(analysis?.sentenceRhythm || "").trim() || null,
    sentenceLengthProfile: String(analysis?.sentenceLengthProfile || "").trim() || null,
    paragraphBreathingPattern: String(analysis?.paragraphBreathingPattern || "").trim() || null,
    structurePatterns: parseJsonArray(row.structure_patterns_json),
    transitionPatterns: parseJsonArray(analysis?.transitionPatterns as string[] | string | null),
    languageHabits: parseJsonArray(row.language_habits_json),
    openingPatterns: parseJsonArray(row.opening_patterns_json),
    endingPatterns: parseJsonArray(row.ending_patterns_json),
    punctuationHabits: parseJsonArray(analysis?.punctuationHabits as string[] | string | null),
    tangentPatterns: parseJsonArray(analysis?.tangentPatterns as string[] | string | null),
    callbackPatterns: parseJsonArray(analysis?.callbackPatterns as string[] | string | null),
    factDensity: String(analysis?.factDensity || "").trim() || null,
    emotionalIntensity: String(analysis?.emotionalIntensity || "").trim() || null,
    suitableTopics: parseJsonArray(analysis?.suitableTopics as string[] | string | null),
    reusablePromptFragments: parseJsonArray(analysis?.reusablePromptFragments as string[] | string | null),
    verbatimPhraseBanks: {
      transitionPhrases: parseJsonArray((analysis?.verbatimPhraseBanks as Record<string, unknown> | null)?.transitionPhrases as string[] | string | null),
      judgementPhrases: parseJsonArray((analysis?.verbatimPhraseBanks as Record<string, unknown> | null)?.judgementPhrases as string[] | string | null),
      selfDisclosurePhrases: parseJsonArray((analysis?.verbatimPhraseBanks as Record<string, unknown> | null)?.selfDisclosurePhrases as string[] | string | null),
      emotionPhrases: parseJsonArray((analysis?.verbatimPhraseBanks as Record<string, unknown> | null)?.emotionPhrases as string[] | string | null),
      readerBridgePhrases: parseJsonArray((analysis?.verbatimPhraseBanks as Record<string, unknown> | null)?.readerBridgePhrases as string[] | string | null),
    },
    tabooPatterns: parseJsonArray(analysis?.tabooPatterns as string[] | string | null),
    statePresets: parseJsonArray(analysis?.statePresets as string[] | string | null),
    antiOutlineRules: parseJsonArray(analysis?.antiOutlineRules as string[] | string | null),
    doNotWrite: parseJsonArray(row.do_not_write_json),
    imitationPrompt: row.imitation_prompt,
    sourceExcerpt: row.source_excerpt,
    sampleCount: Number(analysis?.sampleCount || 1) || 1,
    sampleUrls: parseJsonArray(analysis?.sampleUrls as string[] | string | null),
    sampleTitles: parseJsonArray(analysis?.sampleTitles as string[] | string | null),
    sampleSources: parseSampleSources(analysis?.sampleSources),
    confidenceProfile:
      analysis?.confidenceProfile && typeof analysis.confidenceProfile === "object" && !Array.isArray(analysis.confidenceProfile)
        ? analysis.confidenceProfile as Record<string, number>
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWritingStyleProfileById(userId: number, profileId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<WritingStyleProfileRow>(
    `SELECT *
     FROM writing_style_profiles
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [profileId, userId],
  );
  if (!row) {
    return null;
  }
  return mapWritingStyleProfile(row);
}

function parseJsonArray(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export async function getWritingStyleProfiles(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingStyleProfileRow>(
    `SELECT *
     FROM writing_style_profiles
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId],
  );
  return rows.map(mapWritingStyleProfile);
}

async function countWritingStyleProfiles(userId: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM writing_style_profiles WHERE user_id = ?",
    [userId],
  );
  return row?.count ?? 0;
}

export async function createWritingStyleProfile(userId: number, analysis: WritingStyleAnalysis, preferredName?: string | null) {
  await ensureExtendedProductSchema();
  const { planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.writingStyleProfileLimit;
  if (limit <= 0) {
    throw new Error("当前套餐暂不支持保存写作风格资产");
  }
  const currentCount = await countWritingStyleProfiles(userId);
  if (currentCount >= limit) {
    throw new Error(`当前套餐最多只能保存 ${limit} 个写作风格资产`);
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const name = String(preferredName || analysis.styleName || "").trim() || "未命名写作风格";
  const result = await db.exec(
    `INSERT INTO writing_style_profiles (
      user_id, name, source_url, source_title, summary, tone_keywords_json, structure_patterns_json, language_habits_json,
      opening_patterns_json, ending_patterns_json, do_not_write_json, imitation_prompt, source_excerpt, analysis_payload_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      name,
      analysis.sourceUrl,
      analysis.sourceTitle,
      analysis.summary,
      JSON.stringify(analysis.toneKeywords),
      JSON.stringify(analysis.structurePatterns),
      JSON.stringify(analysis.languageHabits),
      JSON.stringify(analysis.openingPatterns),
      JSON.stringify(analysis.endingPatterns),
      JSON.stringify(analysis.doNotWrite),
      analysis.imitationPrompt,
      analysis.sourceExcerpt,
      JSON.stringify(analysis),
      now,
      now,
    ],
  );
  return result.lastInsertRowid ?? null;
}

export async function deleteWritingStyleProfile(userId: number, profileId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec("DELETE FROM writing_style_profiles WHERE id = ? AND user_id = ?", [profileId, userId]);
}

export async function appendWritingStyleProfileUsageEvent(input: {
  userId: number;
  profileId: number;
  articleId?: number | null;
  usageSource: string;
  profileName?: string | null;
  sampleCount?: number | null;
  usageToken?: string | null;
}) {
  await appendAuditLog({
    userId: input.userId,
    action: "writing_style_profile_used_in_authoring",
    targetType: "writing_style_profile",
    targetId: input.profileId,
    payload: {
      articleId: input.articleId ?? null,
      usageSource: input.usageSource,
      profileName: input.profileName ?? null,
      sampleCount: input.sampleCount ?? null,
      usageToken: input.usageToken ?? null,
      usedAt: new Date().toISOString(),
    },
  });
}

export async function createPendingWritingStyleProfileStreamUsage(input: {
  userId: number;
  profileId: number;
  articleId: number;
  usageToken: string;
  profileName?: string | null;
  sampleCount?: number | null;
}) {
  await appendAuditLog({
    userId: input.userId,
    action: "writing_style_profile_stream_usage_pending",
    targetType: "writing_style_profile",
    targetId: input.profileId,
    payload: {
      articleId: input.articleId,
      usageSource: "article.generate.stream",
      usageToken: input.usageToken,
      profileName: input.profileName ?? null,
      sampleCount: input.sampleCount ?? null,
      generatedAt: new Date().toISOString(),
    },
  });
}

export async function resolvePendingWritingStyleProfileStreamUsage(input: {
  userId: number;
  articleId: number;
  usageToken: string;
}) {
  const normalizedToken = String(input.usageToken || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const db = getDatabase();
  const [pendingRows, usedRows] = await Promise.all([
    db.query<{
      target_id: string | null;
      payload_json: string | Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT target_id, payload_json, created_at
       FROM audit_logs
       WHERE user_id = ? AND action = ? AND target_type = ?
       ORDER BY id DESC
       LIMIT 120`,
      [input.userId, "writing_style_profile_stream_usage_pending", "writing_style_profile"],
    ),
    db.query<{
      payload_json: string | Record<string, unknown> | null;
    }>(
      `SELECT payload_json
       FROM audit_logs
       WHERE user_id = ? AND action = ? AND target_type = ?
       ORDER BY id DESC
       LIMIT 240`,
      [input.userId, "writing_style_profile_used_in_authoring", "writing_style_profile"],
    ),
  ]);

  const alreadyUsed = usedRows.some((row) => {
    const payload = parseJsonObject(row.payload_json);
    return String(payload?.usageToken || "").trim() === normalizedToken;
  });
  if (alreadyUsed) {
    return null;
  }

  for (const row of pendingRows) {
    const payload = parseJsonObject(row.payload_json);
    if (String(payload?.usageToken || "").trim() !== normalizedToken) {
      continue;
    }
    if (Number(payload?.articleId || 0) !== input.articleId) {
      continue;
    }
    const profileId = Number(row.target_id ?? 0);
    if (!Number.isInteger(profileId) || profileId <= 0) {
      continue;
    }
    return {
      profileId,
      articleId: input.articleId,
      usageSource: "article.generate.stream",
      profileName: typeof payload?.profileName === "string" ? payload.profileName : null,
      sampleCount: Number(payload?.sampleCount ?? 0) || 0,
      usageToken: normalizedToken,
      generatedAt: typeof payload?.generatedAt === "string" ? payload.generatedAt : row.created_at,
    };
  }

  return null;
}
