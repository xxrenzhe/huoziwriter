import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { getDatabase } from "./db";
import { derivePersonaName, PERSONA_IDENTITY_OPTIONS, PERSONA_WRITING_STYLE_OPTIONS } from "./persona-catalog";
import { getPersonaTagCatalog, getPersonaTagOptionValues } from "./persona-tags";
import { getUserPlanContext } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getWritingStyleProfileById } from "./writing-style-profiles";

const PERSONAS_TABLE = "personas";
const PERSONA_SOURCES_TABLE = "persona_sources";

export type PersonaRecord = {
  id: number;
  user_id: number;
  name: string;
  identity_tags_json: string | string[];
  writing_style_tags_json: string | string[];
  bound_writing_style_profile_id: number | null;
  summary: string | null;
  domain_keywords_json: string | string[] | null;
  argument_preferences_json: string | string[] | null;
  tone_constraints_json: string | string[] | null;
  audience_hints_json: string | string[] | null;
  source_mode: string;
  is_default: number | boolean;
  created_at: string;
  updated_at: string;
};

type PersonaSourceAnalysis = {
  summary: string;
  identityTags: string[];
  writingStyleTags: string[];
  domainKeywords: string[];
  argumentPreferences: string[];
  toneConstraints: string[];
  audienceHints: string[];
  suggestedName: string;
  rawAnalysis: Record<string, unknown>;
};

type PersonaAnalysisSourceInput = {
  sourceType: "text" | "file";
  title?: string | null;
  sourceUrl?: string | null;
  sourceText: string;
  fileName?: string | null;
  mimeType?: string | null;
};

function parseTagList(value: string | string[] | null | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: unknown, catalog: readonly string[], label: string) {
  if (!Array.isArray(tags)) {
    throw new Error(`${label}不能为空`);
  }
  const normalized = Array.from(new Set(tags.map((item) => String(item).trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new Error(`${label}至少选择 1 项`);
  }
  if (normalized.length > 3) {
    throw new Error(`${label}最多选择 3 项`);
  }
  for (const tag of normalized) {
    if (!catalog.includes(tag)) {
      throw new Error(`${label}包含无效选项：${tag}`);
    }
  }
  return normalized;
}

function normalizeOptionalStringList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

export function getPersonaLimit(planCode: "free" | "pro" | "ultra") {
  if (planCode === "pro") return 3;
  if (planCode === "ultra") return 10;
  return 1;
}

export async function getPersonaLimitForUser(userId: number) {
  const { effectivePlanCode } = await getUserPlanContext(userId);
  return getPersonaLimit(effectivePlanCode);
}

export async function getPersonas(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<PersonaRecord>(
    `SELECT id, user_id, name, identity_tags_json, writing_style_tags_json, bound_writing_style_profile_id,
            summary, domain_keywords_json, argument_preferences_json, tone_constraints_json, audience_hints_json,
            source_mode, is_default, created_at, updated_at
     FROM ${PERSONAS_TABLE}
     WHERE user_id = ?
     ORDER BY is_default DESC, id ASC`,
    [userId],
  );
  const profileIds = Array.from(
    new Set(
      rows
        .map((row) => row.bound_writing_style_profile_id)
        .filter((item): item is number => typeof item === "number" && item > 0),
    ),
  );
  const profiles = await Promise.all(profileIds.map((profileId) => getWritingStyleProfileById(userId, profileId)));
  const profileMap = new Map(profiles.filter(Boolean).map((profile) => [profile!.id, profile!]));
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    identityTags: parseTagList(row.identity_tags_json),
    writingStyleTags: parseTagList(row.writing_style_tags_json),
    boundWritingStyleProfileId: row.bound_writing_style_profile_id,
    summary: row.summary,
    domainKeywords: parseTagList(row.domain_keywords_json),
    argumentPreferences: parseTagList(row.argument_preferences_json),
    toneConstraints: parseTagList(row.tone_constraints_json),
    audienceHints: parseTagList(row.audience_hints_json),
    sourceMode: row.source_mode,
    boundWritingStyleProfileName:
      row.bound_writing_style_profile_id && profileMap.get(row.bound_writing_style_profile_id)
        ? profileMap.get(row.bound_writing_style_profile_id)?.name ?? null
        : null,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getPersonaCatalog() {
  await ensureExtendedProductSchema();
  return getPersonaTagCatalog();
}

export async function getDefaultPersona(userId: number) {
  const personas = await getPersonas(userId);
  return personas.find((item) => item.isDefault) ?? personas[0] ?? null;
}

export async function assertPersonaReady(userId: number) {
  const persona = await getDefaultPersona(userId);
  if (!persona) {
    throw new Error("首次进入写作系统前，请先配置至少 1 个默认作者人设");
  }
  return persona;
}

async function countPersonas(userId: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${PERSONAS_TABLE} WHERE user_id = ?`, [
    userId,
  ]);
  return row?.count ?? 0;
}

export async function hasPersona(userId: number) {
  return (await countPersonas(userId)) > 0;
}

async function getPersonaRow(userId: number, personaId: number) {
  const db = getDatabase();
  return db.queryOne<PersonaRecord>(
    `SELECT id, user_id, name, identity_tags_json, writing_style_tags_json, bound_writing_style_profile_id,
            summary, domain_keywords_json, argument_preferences_json, tone_constraints_json, audience_hints_json,
            source_mode, is_default, created_at, updated_at
     FROM ${PERSONAS_TABLE}
     WHERE id = ? AND user_id = ?`,
    [personaId, userId],
  );
}

async function resolveBoundWritingStyleProfileId(userId: number, profileId: unknown) {
  if (profileId == null || profileId === "") {
    return null;
  }
  const normalizedId = Number(profileId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new Error("绑定的写作风格资产无效");
  }
  const profile = await getWritingStyleProfileById(userId, normalizedId);
  if (!profile) {
    throw new Error("绑定的写作风格资产不存在");
  }
  return normalizedId;
}

export async function createPersona(input: {
  userId: number;
  name?: string | null;
  identityTags: unknown;
  writingStyleTags: unknown;
  boundWritingStyleProfileId?: unknown;
  summary?: unknown;
  domainKeywords?: unknown;
  argumentPreferences?: unknown;
  toneConstraints?: unknown;
  audienceHints?: unknown;
  sourceMode?: unknown;
  isDefault?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const catalog = await getPersonaTagOptionValues();
  const identityTags = normalizeTags(
    input.identityTags,
    catalog.identity.length ? catalog.identity : PERSONA_IDENTITY_OPTIONS,
    "身份维度",
  );
  const writingStyleTags = normalizeTags(
    input.writingStyleTags,
    catalog.writingStyle.length ? catalog.writingStyle : PERSONA_WRITING_STYLE_OPTIONS,
    "写作风格",
  );
  const boundWritingStyleProfileId = await resolveBoundWritingStyleProfileId(input.userId, input.boundWritingStyleProfileId);
  const limit = await getPersonaLimitForUser(input.userId);
  const existingCount = await countPersonas(input.userId);
  if (existingCount >= limit) {
    throw new Error(`当前套餐最多只能配置 ${limit} 个作者人设`);
  }

  const now = new Date().toISOString();
  const name = String(input.name || "").trim() || derivePersonaName(identityTags, writingStyleTags);
  const shouldBeDefault = existingCount === 0 || Boolean(input.isDefault);
  const summary = String(input.summary || "").trim() || null;
  const domainKeywords = normalizeOptionalStringList(input.domainKeywords, 8);
  const argumentPreferences = normalizeOptionalStringList(input.argumentPreferences, 6);
  const toneConstraints = normalizeOptionalStringList(input.toneConstraints, 6);
  const audienceHints = normalizeOptionalStringList(input.audienceHints, 6);
  const sourceMode = String(input.sourceMode || "").trim() === "analyzed" ? "analyzed" : "manual";

  if (shouldBeDefault) {
    await db.exec(`UPDATE ${PERSONAS_TABLE} SET is_default = ?, updated_at = ? WHERE user_id = ?`, [false, now, input.userId]);
  }

  const result = await db.exec(
    `INSERT INTO ${PERSONAS_TABLE} (
      user_id, name, identity_tags_json, writing_style_tags_json, bound_writing_style_profile_id,
      summary, domain_keywords_json, argument_preferences_json, tone_constraints_json, audience_hints_json,
      source_mode, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      name,
      JSON.stringify(identityTags),
      JSON.stringify(writingStyleTags),
      boundWritingStyleProfileId,
      summary,
      JSON.stringify(domainKeywords),
      JSON.stringify(argumentPreferences),
      JSON.stringify(toneConstraints),
      JSON.stringify(audienceHints),
      sourceMode,
      shouldBeDefault,
      now,
      now,
    ],
  );
  const created = await getPersonas(input.userId);
  const createdPersona = created.find((item) => item.id === Number(result.lastInsertRowid!));
  if (!createdPersona) {
    throw new Error("作者人设创建失败");
  }
  return createdPersona;
}

export async function updatePersona(input: {
  userId: number;
  personaId: number;
  name?: string | null;
  identityTags?: unknown;
  writingStyleTags?: unknown;
  boundWritingStyleProfileId?: unknown;
  summary?: unknown;
  domainKeywords?: unknown;
  argumentPreferences?: unknown;
  toneConstraints?: unknown;
  audienceHints?: unknown;
  sourceMode?: unknown;
  isDefault?: boolean;
}) {
  await ensureExtendedProductSchema();
  const current = await getPersonaRow(input.userId, input.personaId);
  if (!current) {
    throw new Error("作者人设不存在");
  }

  const catalog = await getPersonaTagOptionValues();
  const identityTags =
    input.identityTags == null
      ? parseTagList(current.identity_tags_json)
      : normalizeTags(
          input.identityTags,
          catalog.identity.length ? catalog.identity : PERSONA_IDENTITY_OPTIONS,
          "身份维度",
        );
  const writingStyleTags =
    input.writingStyleTags == null
      ? parseTagList(current.writing_style_tags_json)
      : normalizeTags(
          input.writingStyleTags,
          catalog.writingStyle.length ? catalog.writingStyle : PERSONA_WRITING_STYLE_OPTIONS,
          "写作风格",
        );
  const boundWritingStyleProfileId =
    input.boundWritingStyleProfileId === undefined
      ? current.bound_writing_style_profile_id
      : await resolveBoundWritingStyleProfileId(input.userId, input.boundWritingStyleProfileId);
  const summary = input.summary === undefined ? current.summary : String(input.summary || "").trim() || null;
  const domainKeywords =
    input.domainKeywords === undefined
      ? parseTagList(current.domain_keywords_json)
      : normalizeOptionalStringList(input.domainKeywords, 8);
  const argumentPreferences =
    input.argumentPreferences === undefined
      ? parseTagList(current.argument_preferences_json)
      : normalizeOptionalStringList(input.argumentPreferences, 6);
  const toneConstraints =
    input.toneConstraints === undefined
      ? parseTagList(current.tone_constraints_json)
      : normalizeOptionalStringList(input.toneConstraints, 6);
  const audienceHints =
    input.audienceHints === undefined
      ? parseTagList(current.audience_hints_json)
      : normalizeOptionalStringList(input.audienceHints, 6);
  const sourceMode =
    input.sourceMode === undefined
      ? current.source_mode
      : String(input.sourceMode || "").trim() === "analyzed"
        ? "analyzed"
        : "manual";
  const name = String(input.name ?? current.name).trim() || derivePersonaName(identityTags, writingStyleTags);
  const now = new Date().toISOString();
  const db = getDatabase();

  if (input.isDefault) {
    await db.exec(`UPDATE ${PERSONAS_TABLE} SET is_default = ?, updated_at = ? WHERE user_id = ?`, [false, now, input.userId]);
  }

  await db.exec(
    `UPDATE ${PERSONAS_TABLE}
     SET name = ?, identity_tags_json = ?, writing_style_tags_json = ?, bound_writing_style_profile_id = ?,
         summary = ?, domain_keywords_json = ?, argument_preferences_json = ?, tone_constraints_json = ?, audience_hints_json = ?,
         source_mode = ?, is_default = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      name,
      JSON.stringify(identityTags),
      JSON.stringify(writingStyleTags),
      boundWritingStyleProfileId,
      summary,
      JSON.stringify(domainKeywords),
      JSON.stringify(argumentPreferences),
      JSON.stringify(toneConstraints),
      JSON.stringify(audienceHints),
      sourceMode,
      input.isDefault ?? current.is_default,
      now,
      input.personaId,
      input.userId,
    ],
  );

  const updated = (await getPersonas(input.userId)).find((item) => item.id === input.personaId);
  if (!updated) {
    throw new Error("作者人设更新失败");
  }
  return updated;
}

async function analyzePersonaSource(input: {
  name?: string | null;
  sources: PersonaAnalysisSourceInput[];
}) {
  const catalog = await getPersonaTagOptionValues();
  const identityOptions = catalog.identity.length ? catalog.identity : [...PERSONA_IDENTITY_OPTIONS];
  const writingStyleOptions = catalog.writingStyle.length ? catalog.writingStyle : [...PERSONA_WRITING_STYLE_OPTIONS];
  const mergedSourceText = input.sources
    .map((source, index) => {
      const sourceLabel = source.sourceType === "file" ? "文件资料" : "文本资料";
      const title = String(source.title || source.fileName || `${sourceLabel} ${index + 1}`).trim();
      const sourceUrl = String(source.sourceUrl || "").trim();
      const normalizedText = String(source.sourceText || "").trim().slice(0, 4_000);
      return [`[${sourceLabel} ${index + 1}] ${title}`, sourceUrl ? `来源链接：${sourceUrl}` : null, normalizedText]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n====\n\n")
    .slice(0, 18_000);
  const systemPrompt = ["你是作者人设分析器。", "请根据用户提供的资料，总结出一个适合中文内容写作系统的人设画像。", "只返回 JSON，不要输出任何额外解释。"].join("\n");
  const userPrompt = [
    input.name ? `用户期望名称：${input.name}` : "用户未指定名称，请你建议一个更贴合资料的人设名称。",
    `身份标签只能从以下选项中选 1-3 个：${identityOptions.join("、")}`,
    `写作风格标签只能从以下选项中选 1-3 个：${writingStyleOptions.join("、")}`,
    '返回字段：{"suggestedName":"字符串","summary":"字符串","identityTags":[""],"writingStyleTags":[""],"domainKeywords":[""],"argumentPreferences":[""],"toneConstraints":[""],"audienceHints":[""]}',
    "要求：summary 要说明这个人设最擅长写什么、常站在哪种立场、适合怎么说话；其余数组都控制在 3-6 条内。",
    `当前共有 ${input.sources.length} 份资料，请综合分析，不要只盯着其中一份。`,
    "",
    "资料正文：",
    mergedSourceText,
  ].join("\n");

  const raw = await generateSceneText({
    sceneCode: "styleExtract",
    systemPrompt,
    userPrompt,
    temperature: 0.2,
  });
  const parsed = extractJsonObject(raw.text) as Record<string, unknown>;
  const identityTags = normalizeTags(
    Array.isArray(parsed.identityTags) ? parsed.identityTags : [],
    identityOptions,
    "身份维度",
  );
  const writingStyleTags = normalizeTags(
    Array.isArray(parsed.writingStyleTags) ? parsed.writingStyleTags : [],
    writingStyleOptions,
    "写作风格",
  );
  return {
    summary: String(parsed.summary || "").trim(),
    identityTags,
    writingStyleTags,
    domainKeywords: normalizeOptionalStringList(parsed.domainKeywords, 8),
    argumentPreferences: normalizeOptionalStringList(parsed.argumentPreferences, 6),
    toneConstraints: normalizeOptionalStringList(parsed.toneConstraints, 6),
    audienceHints: normalizeOptionalStringList(parsed.audienceHints, 6),
    suggestedName:
      String(parsed.suggestedName || "").trim()
      || String(input.name || "").trim()
      || derivePersonaName(identityTags, writingStyleTags),
    rawAnalysis: parsed,
  } satisfies PersonaSourceAnalysis;
}

export async function createPersonaFromSourceAnalysis(input: {
  userId: number;
  name?: string | null;
  sources: PersonaAnalysisSourceInput[];
  isDefault?: boolean;
}) {
  await ensureExtendedProductSchema();
  const normalizedSources = (Array.isArray(input.sources) ? input.sources : [])
    .map((source) => ({
      sourceType: (String(source.sourceType || "").trim() === "file" ? "file" : "text") as "text" | "file",
      title: String(source.title || "").trim() || null,
      sourceUrl: String(source.sourceUrl || "").trim() || null,
      sourceText: String(source.sourceText || "").trim(),
      fileName: String(source.fileName || "").trim() || null,
      mimeType: String(source.mimeType || "").trim() || null,
    }))
    .filter((source) => source.sourceText.length > 0)
    .slice(0, 6);
  const mergedLength = normalizedSources.reduce((sum, source) => sum + source.sourceText.length, 0);
  if (normalizedSources.length === 0 || mergedLength < 80) {
    throw new Error("资料内容过短，至少提供一段较完整的背景、表达样本或工作说明。");
  }
  const analysis = await analyzePersonaSource({
    name: input.name,
    sources: normalizedSources,
  });
  const persona = await createPersona({
    userId: input.userId,
    name: String(input.name || "").trim() || analysis.suggestedName,
    identityTags: analysis.identityTags,
    writingStyleTags: analysis.writingStyleTags,
    summary: analysis.summary,
    domainKeywords: analysis.domainKeywords,
    argumentPreferences: analysis.argumentPreferences,
    toneConstraints: analysis.toneConstraints,
    audienceHints: analysis.audienceHints,
    sourceMode: "analyzed",
    isDefault: input.isDefault,
  });

  const now = new Date().toISOString();
  const db = getDatabase();
  for (const source of normalizedSources) {
    await db.exec(
      `INSERT INTO ${PERSONA_SOURCES_TABLE} (
        persona_id, source_type, title, source_url, file_path, extracted_text, analysis_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        persona.id,
        source.sourceType,
        source.title || source.fileName || null,
        source.sourceUrl,
        source.sourceType === "file" ? source.fileName || null : null,
        source.sourceText,
        JSON.stringify({
          ...analysis.rawAnalysis,
          sourceMimeType: source.mimeType,
        }),
        now,
        now,
      ],
    );
  }

  const created = (await getPersonas(input.userId)).find((item) => item.id === persona.id);
  if (!created) {
    throw new Error("资料人设创建失败");
  }
  return created;
}

export async function deletePersona(userId: number, personaId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const current = await getPersonaRow(userId, personaId);
  if (!current) {
    throw new Error("作者人设不存在");
  }

  const total = await countPersonas(userId);
  if (total <= 1) {
    throw new Error("至少保留 1 个作者人设");
  }

  await db.exec(`DELETE FROM ${PERSONAS_TABLE} WHERE id = ? AND user_id = ?`, [personaId, userId]);

  if (Boolean(current.is_default)) {
    const next = await db.queryOne<{ id: number }>(
      `SELECT id FROM ${PERSONAS_TABLE} WHERE user_id = ? ORDER BY id ASC LIMIT 1`,
      [userId],
    );
    if (next) {
      await db.exec(`UPDATE ${PERSONAS_TABLE} SET is_default = ?, updated_at = ? WHERE id = ? AND user_id = ?`, [
        true,
        new Date().toISOString(),
        next.id,
        userId,
      ]);
    }
  }
}
