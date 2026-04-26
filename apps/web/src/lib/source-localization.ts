import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { loadPrompt } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";

export type SourceLanguage = "zh" | "en" | "mixed" | "unknown";

export type LocalizedSourceMaterial = {
  sourceLanguage: SourceLanguage;
  localizationStatus: "skipped" | "localized" | "degraded";
  originalTitle: string;
  originalExcerpt: string;
  localizedTitle: string;
  localizedSummary: string;
  factPointsZh: string[];
  quoteCandidatesZh: string[];
  termMappings: Array<{ sourceTerm: string; zhTerm: string; note?: string | null }>;
  translationRisk: string | null;
  composedChineseContent: string;
  degradedReason: string | null;
};

type TermMapping = { sourceTerm: string; zhTerm: string; note?: string | null };

type LocalizationScenePayload = {
  localizedTitle?: string;
  localizedSummary?: string;
  factPointsZh?: unknown;
  quoteCandidatesZh?: unknown;
  termMappings?: unknown;
  translationRisk?: string | null;
};

function truncateText(value: string, limit = 240) {
  return value.length > limit ? value.slice(0, limit) + "…" : value;
}

function uniqueStrings(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function countMatches(value: string, pattern: RegExp) {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

export function detectSourceLanguage(input: {
  title?: string | null;
  excerpt?: string | null;
  rawContent?: string | null;
}): SourceLanguage {
  const seed = [input.title, input.excerpt, input.rawContent].map((item) => String(item || "")).join(" ").trim();
  if (!seed) {
    return "unknown";
  }
  const cjkCount = countMatches(seed, /[\u4e00-\u9fff]/g);
  const latinTokenCount = countMatches(seed.toLowerCase(), /\b[a-z]{2,}\b/g);
  if (cjkCount >= 12 && latinTokenCount <= 6) {
    return "zh";
  }
  if (latinTokenCount >= 12 && cjkCount <= 6) {
    return "en";
  }
  if (cjkCount > 0 && latinTokenCount > 0) {
    return "mixed";
  }
  return cjkCount > 0 ? "zh" : latinTokenCount > 0 ? "en" : "unknown";
}

export function shouldLocalizeSourceMaterial(input: {
  title?: string | null;
  excerpt?: string | null;
  rawContent?: string | null;
}) {
  const language = detectSourceLanguage(input);
  if (language === "en") return true;
  if (language !== "mixed") return false;
  const seed = [input.title, input.excerpt, input.rawContent].map((item) => String(item || "")).join(" ");
  const cjkCount = countMatches(seed, /[\u4e00-\u9fff]/g);
  const latinTokenCount = countMatches(seed.toLowerCase(), /\b[a-z]{2,}\b/g);
  return latinTokenCount >= cjkCount;
}

function normalizeTermMappings(value: unknown): TermMapping[] {
  if (!Array.isArray(value)) return [];
  const mappings: TermMapping[] = [];
  for (const item of value) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
    const sourceTerm = String(record?.sourceTerm || "").trim();
    const zhTerm = String(record?.zhTerm || "").trim();
    const note = String(record?.note || "").trim() || null;
    if (!sourceTerm || !zhTerm) continue;
    mappings.push({ sourceTerm, zhTerm, note });
    if (mappings.length >= 6) break;
  }
  return mappings;
}

export function composeLocalizedChineseContent(input: {
  localizedSummary: string;
  factPointsZh?: string[];
  quoteCandidatesZh?: string[];
  termMappings?: Array<{ sourceTerm: string; zhTerm: string; note?: string | null }>;
  translationRisk?: string | null;
}) {
  const lines = [
    String(input.localizedSummary || "").trim(),
    ...(input.factPointsZh || []).map((item, index) => `${index + 1}. ${String(item || "").trim()}`),
    (input.termMappings || []).length > 0
      ? `术语对照：${input.termMappings!.map((item) => `${item.sourceTerm}=${item.zhTerm}${item.note ? `（${item.note}）` : ""}`).join("；")}`
      : null,
    (input.quoteCandidatesZh || []).length > 0
      ? `可引用表述：${input.quoteCandidatesZh!.map((item) => String(item || "").trim()).filter(Boolean).join("；")}`
      : null,
    input.translationRisk ? `转述提醒：${String(input.translationRisk).trim()}` : null,
  ].filter(Boolean);
  return lines.join("\n").trim();
}

export async function localizeSourceMaterialToChinese(
  input: {
    title?: string | null;
    excerpt?: string | null;
    rawContent?: string | null;
    sourceUrl?: string | null;
  },
  deps?: {
    loadSystemPrompt?: () => Promise<string>;
    runScene?: (input: { systemPrompt: string; userPrompt: string }) => Promise<string>;
  },
): Promise<LocalizedSourceMaterial> {
  const originalTitle = String(input.title || "").trim();
  const originalExcerpt = String(input.excerpt || input.rawContent || "").replace(/\s+/g, " ").trim().slice(0, 2400);
  const sourceLanguage = detectSourceLanguage(input);

  if (!shouldLocalizeSourceMaterial(input)) {
    const passthrough = truncateText(originalExcerpt, 320);
    return {
      sourceLanguage,
      localizationStatus: "skipped",
      originalTitle,
      originalExcerpt,
      localizedTitle: originalTitle,
      localizedSummary: passthrough,
      factPointsZh: [],
      quoteCandidatesZh: [],
      termMappings: [],
      translationRisk: null,
      composedChineseContent: passthrough,
      degradedReason: null,
    };
  }

  const userPrompt = [
    "请把下面的英文或中英混合信源，转成适合中文公众号写作系统消费的中文化表达。",
    "只做事实不变的中文转述，不要新增结论，不要补编背景。",
    '返回 JSON，不要解释，不要 markdown。字段：{"localizedTitle":"字符串","localizedSummary":"字符串","factPointsZh":["字符串"],"quoteCandidatesZh":["字符串"],"termMappings":[{"sourceTerm":"字符串","zhTerm":"字符串","note":"字符串或空"}],"translationRisk":"字符串或空"}',
    "localizedSummary 用自然中文概括，可直接给写作阶段使用。",
    "factPointsZh 只写可核查的事实点，最多 4 条。",
    "quoteCandidatesZh 写适合正文引用的中文表述，最多 2 条。",
    "专业名词、产品名、岗位名、平台规则名，必要时保留中英双写。",
    "如果原文带明显主观看法、营销腔或未证实判断，translationRisk 里要明确提醒。",
    input.sourceUrl ? formatPromptTemplate("sourceUrl: {{value}}", { value: input.sourceUrl }) : null,
    originalTitle ? formatPromptTemplate("sourceTitle: {{value}}", { value: originalTitle }) : null,
    "",
    originalExcerpt,
  ].filter(Boolean).join("\n");

  try {
    const systemPrompt = deps?.loadSystemPrompt
      ? await deps.loadSystemPrompt()
      : await loadPrompt("source_localization");
    const text = deps?.runScene
      ? await deps.runScene({ systemPrompt, userPrompt })
      : (await generateSceneText({
        sceneCode: "sourceLocalization",
        systemPrompt,
        userPrompt,
        temperature: 0.2,
      })).text;
    const payload = extractJsonObject(text) as LocalizationScenePayload;
    const localizedSummary = String(payload.localizedSummary || "").trim() || truncateText(originalExcerpt, 320);
    const factPointsZh = uniqueStrings(payload.factPointsZh, 4);
    const quoteCandidatesZh = uniqueStrings(payload.quoteCandidatesZh, 2);
    const termMappings = normalizeTermMappings(payload.termMappings);
    const translationRisk = String(payload.translationRisk || "").trim() || null;
    const localizedTitle = String(payload.localizedTitle || "").trim() || originalTitle;
    return {
      sourceLanguage,
      localizationStatus: "localized",
      originalTitle,
      originalExcerpt,
      localizedTitle,
      localizedSummary,
      factPointsZh,
      quoteCandidatesZh,
      termMappings,
      translationRisk,
      composedChineseContent: composeLocalizedChineseContent({
        localizedSummary,
        factPointsZh,
        quoteCandidatesZh,
        termMappings,
        translationRisk,
      }),
      degradedReason: null,
    };
  } catch (error) {
    const fallback = truncateText(originalExcerpt, 320);
    return {
      sourceLanguage,
      localizationStatus: "degraded",
      originalTitle,
      originalExcerpt,
      localizedTitle: originalTitle,
      localizedSummary: fallback,
      factPointsZh: [],
      quoteCandidatesZh: [],
      termMappings: [],
      translationRisk: "中文化表达转化失败，本条仍以原文事实为准。",
      composedChineseContent: fallback,
      degradedReason: error instanceof Error ? error.message : "sourceLocalization failed",
    };
  }
}
