import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { getDatabase } from "./db";
import { fetchExternalText } from "./external-fetch";
import { syncTemplateVersionToLayoutTemplates } from "./layout-templates";
import { loadPrompt } from "./prompt-loader";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

function decodeHtml(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

function deriveTemplateConfig(html: string) {
  const text = stripHtml(html);
  const paragraphCount = countMatches(html, /<p[\s>]/gi);
  const headingCount = countMatches(html, /<h[1-3][\s>]/gi);
  const listCount = countMatches(html, /<(ul|ol)[\s>]/gi);
  const codeBlockCount = countMatches(html, /<pre[\s>]/gi);
  const serifScore = countMatches(html, /font-family:[^;"']*(serif|Georgia|Times|Noto Serif)/gi);
  const strongScore = countMatches(html, /<(strong|b)[\s>]/gi);
  const tone = strongScore > 8 ? "强对比评论" : "克制报道";
  const paragraphLength = paragraphCount >= 10 ? "short" : paragraphCount >= 5 ? "medium" : "long";
  const titleStyle = serifScore > 0 ? "serif" : headingCount > 2 ? "sharp" : "plain";
  const backgroundStyle = serifScore > 0 ? "scroll" : headingCount > 2 ? "newsprint" : "paper";
  const emphasisStyle = strongScore > 8 ? "marker" : serifScore > 0 ? "underline" : "badge";
  const quoteStyle = serifScore > 0 ? "editorial" : headingCount > 2 ? "news" : "note";
  const codeBlockStyle = codeBlockCount > 0 ? (strongScore > 8 ? "terminal" : "ink") : "soft";
  const commandBlockStyle = codeBlockCount > 0 ? (strongScore > 8 ? "terminal" : "command") : "soft-command";
  const dividerStyle = serifScore > 0 ? "seal" : headingCount > 2 ? "hairline" : "dots";
  const recommendationStyle = listCount > 0 ? (serifScore > 0 ? "card" : "compact") : "checklist";

  return {
    schemaVersion: "v2",
    tone,
    paragraphLength,
    titleStyle,
    backgroundStyle,
    emphasisStyle,
    quoteStyle,
    codeBlockStyle,
    commandBlockStyle,
    dividerStyle,
    recommendationStyle,
    identity: {
      tone,
      sourceExcerpt: text.slice(0, 160),
    },
    layout: {
      paragraphLength,
      backgroundStyle,
      dividerStyle,
    },
    typography: {
      titleStyle,
      emphasisStyle,
      quoteStyle,
    },
    blocks: {
      codeBlockStyle,
      commandBlockStyle,
      recommendationStyle,
    },
    extraction: {
      headingDensity: headingCount,
      listUsage: listCount > 0 ? "structured" : "freeform",
      serifScore,
      strongScore,
      paragraphCount,
      codeBlockCount,
    },
  };
}

const TITLE_STYLE_OPTIONS = ["plain", "serif", "sharp"] as const;
const PARAGRAPH_LENGTH_OPTIONS = ["short", "medium", "long"] as const;
const BACKGROUND_STYLE_OPTIONS = ["paper", "scroll", "newsprint"] as const;
const EMPHASIS_STYLE_OPTIONS = ["marker", "underline", "badge"] as const;
const QUOTE_STYLE_OPTIONS = ["note", "editorial", "news"] as const;
const CODE_BLOCK_STYLE_OPTIONS = ["ink", "soft", "terminal"] as const;
const COMMAND_BLOCK_STYLE_OPTIONS = ["command", "soft-command", "terminal"] as const;
const DIVIDER_STYLE_OPTIONS = ["hairline", "seal", "dots"] as const;
const RECOMMENDATION_STYLE_OPTIONS = ["compact", "card", "checklist"] as const;

function pickEnumValue<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  const normalized = String(value || "").trim();
  return (options as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

function normalizeStringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit)
    : [];
}

function normalizeTemplateConfig(value: unknown, fallback: ReturnType<typeof deriveTemplateConfig>) {
  const parsed = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const identity = parsed.identity && typeof parsed.identity === "object" && !Array.isArray(parsed.identity)
    ? parsed.identity as Record<string, unknown>
    : {};
  const layout = parsed.layout && typeof parsed.layout === "object" && !Array.isArray(parsed.layout)
    ? parsed.layout as Record<string, unknown>
    : {};
  const typography = parsed.typography && typeof parsed.typography === "object" && !Array.isArray(parsed.typography)
    ? parsed.typography as Record<string, unknown>
    : {};
  const blocks = parsed.blocks && typeof parsed.blocks === "object" && !Array.isArray(parsed.blocks)
    ? parsed.blocks as Record<string, unknown>
    : {};
  const constraints = parsed.constraints && typeof parsed.constraints === "object" && !Array.isArray(parsed.constraints)
    ? parsed.constraints as Record<string, unknown>
    : {};
  const extraction = parsed.extraction && typeof parsed.extraction === "object" && !Array.isArray(parsed.extraction)
    ? parsed.extraction as Record<string, unknown>
    : {};

  const tone = String(identity.tone || parsed.tone || fallback.identity.tone || "克制报道").trim() || "克制报道";
  const titleStyle = pickEnumValue(typography.titleStyle || parsed.titleStyle, TITLE_STYLE_OPTIONS, fallback.typography.titleStyle as (typeof TITLE_STYLE_OPTIONS)[number]);
  const paragraphLength = pickEnumValue(layout.paragraphLength || parsed.paragraphLength, PARAGRAPH_LENGTH_OPTIONS, fallback.layout.paragraphLength as (typeof PARAGRAPH_LENGTH_OPTIONS)[number]);
  const backgroundStyle = pickEnumValue(layout.backgroundStyle || parsed.backgroundStyle, BACKGROUND_STYLE_OPTIONS, fallback.layout.backgroundStyle as (typeof BACKGROUND_STYLE_OPTIONS)[number]);
  const emphasisStyle = pickEnumValue(typography.emphasisStyle || parsed.emphasisStyle, EMPHASIS_STYLE_OPTIONS, fallback.typography.emphasisStyle as (typeof EMPHASIS_STYLE_OPTIONS)[number]);
  const quoteStyle = pickEnumValue(typography.quoteStyle || parsed.quoteStyle, QUOTE_STYLE_OPTIONS, fallback.typography.quoteStyle as (typeof QUOTE_STYLE_OPTIONS)[number]);
  const codeBlockStyle = pickEnumValue(blocks.codeBlockStyle || parsed.codeBlockStyle, CODE_BLOCK_STYLE_OPTIONS, fallback.blocks.codeBlockStyle as (typeof CODE_BLOCK_STYLE_OPTIONS)[number]);
  const commandBlockStyle = pickEnumValue(blocks.commandBlockStyle || parsed.commandBlockStyle, COMMAND_BLOCK_STYLE_OPTIONS, fallback.blocks.commandBlockStyle as (typeof COMMAND_BLOCK_STYLE_OPTIONS)[number]);
  const dividerStyle = pickEnumValue(layout.dividerStyle || parsed.dividerStyle, DIVIDER_STYLE_OPTIONS, fallback.layout.dividerStyle as (typeof DIVIDER_STYLE_OPTIONS)[number]);
  const recommendationStyle = pickEnumValue(blocks.recommendationStyle || parsed.recommendationStyle, RECOMMENDATION_STYLE_OPTIONS, fallback.blocks.recommendationStyle as (typeof RECOMMENDATION_STYLE_OPTIONS)[number]);

  return {
    schemaVersion: "v2",
    tone,
    paragraphLength,
    titleStyle,
    backgroundStyle,
    emphasisStyle,
    quoteStyle,
    codeBlockStyle,
    commandBlockStyle,
    dividerStyle,
    recommendationStyle,
    identity: {
      tone,
      sourceExcerpt: String(identity.sourceExcerpt || fallback.identity.sourceExcerpt || "").trim().slice(0, 160),
    },
    layout: {
      paragraphLength,
      backgroundStyle,
      dividerStyle,
    },
    typography: {
      titleStyle,
      emphasisStyle,
      quoteStyle,
    },
    blocks: {
      codeBlockStyle,
      commandBlockStyle,
      recommendationStyle,
    },
    constraints: {
      bannedWords: normalizeStringArray(constraints.bannedWords || parsed.bannedWords, 10),
      bannedPunctuation: normalizeStringArray(constraints.bannedPunctuation || parsed.bannedPunctuation, 10),
    },
    extraction: {
      headingDensity: typeof extraction.headingDensity === "number" ? extraction.headingDensity : fallback.extraction.headingDensity,
      listUsage: String(extraction.listUsage || fallback.extraction.listUsage || "").trim() || fallback.extraction.listUsage,
      serifScore: typeof extraction.serifScore === "number" ? extraction.serifScore : fallback.extraction.serifScore,
      strongScore: typeof extraction.strongScore === "number" ? extraction.strongScore : fallback.extraction.strongScore,
      paragraphCount: typeof extraction.paragraphCount === "number" ? extraction.paragraphCount : fallback.extraction.paragraphCount,
      codeBlockCount: typeof extraction.codeBlockCount === "number" ? extraction.codeBlockCount : fallback.extraction.codeBlockCount,
    },
  };
}

async function deriveTemplateConfigWithAi(input: {
  title: string;
  finalUrl: string;
  html: string;
  fallback: ReturnType<typeof deriveTemplateConfig>;
}) {
  const systemPrompt = await loadPrompt("layout_extract");
  const strippedText = stripHtml(input.html).slice(0, 3500);
  const userPrompt = [
    "请分析下面网页文章的排版结构，并输出 JSON，不要解释，不要 markdown。",
    '字段：{"tone":"字符串","titleStyle":"plain|serif|sharp","paragraphLength":"short|medium|long","backgroundStyle":"paper|scroll|newsprint","emphasisStyle":"marker|underline|badge","quoteStyle":"note|editorial|news","codeBlockStyle":"ink|soft|terminal","commandBlockStyle":"command|soft-command|terminal","dividerStyle":"hairline|seal|dots","recommendationStyle":"compact|card|checklist","identity":{"tone":"字符串","sourceExcerpt":"字符串"},"constraints":{"bannedWords":[""],"bannedPunctuation":[""]},"extraction":{"headingDensity":0,"listUsage":"freeform|structured","serifScore":0,"strongScore":0,"paragraphCount":0,"codeBlockCount":0}}',
    "只允许使用给定枚举值，不要杜撰新的样式名。",
    "如果页面结构不明显，优先选择最贴近的微信排版风格，而不是输出空值。",
    `页面标题：${input.title || "未命名页面"}`,
    `页面地址：${input.finalUrl}`,
    `当前启发式候选：${JSON.stringify(input.fallback)}`,
    "页面正文摘要：",
    strippedText,
  ].join("\n");

  const result = await generateSceneText({
    sceneCode: "layoutExtract",
    systemPrompt,
    userPrompt,
    temperature: 0.1,
  });

  return normalizeTemplateConfig(extractJsonObject(result.text), input.fallback);
}

function deriveTemplateName(title: string, hostname: string) {
  const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleanTitle || `${hostname} 提取模板`;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

export async function extractTemplateFromUrl(url: string, userId?: number) {
  await ensureExtendedProductSchema();
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    throw new Error("模板链接不能为空");
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(normalizedUrl);
  } catch {
    throw new Error("模板链接格式不正确");
  }

  const response = await fetchExternalText({
    url: normalizedUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  const html = response.text;
  const title = extractTitle(html);
  const heuristicConfig = deriveTemplateConfig(html);
  const config = await (async () => {
    try {
      return await deriveTemplateConfigWithAi({
        title,
        finalUrl: response.finalUrl || normalizedUrl,
        html,
        fallback: heuristicConfig,
      });
    } catch {
      return heuristicConfig;
    }
  })();
  const db = getDatabase();
  const now = new Date().toISOString();
  const finalHostname = (() => {
    try {
      return new URL(response.finalUrl).hostname;
    } catch {
      return pageUrl.hostname;
    }
  })();
  const templateId = `external-${finalHostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
  const version = "v1.0.0";
  const name = deriveTemplateName(title, finalHostname);
  const description = `从 ${finalHostname} 实页结构提取的版式候选，适合继续人工微调后复用。`;

  await db.exec(
    `INSERT INTO template_versions (template_id, version, owner_user_id, name, description, source_url, config_json, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [templateId, version, userId ?? null, name, description, response.finalUrl || normalizedUrl, JSON.stringify(config), true, now],
  );

  await syncTemplateVersionToLayoutTemplates({
    templateId,
    version,
    ownerUserId: userId ?? null,
    name,
    description,
    sourceUrl: response.finalUrl || normalizedUrl,
    meta: "自定义模板",
    config,
    isActive: true,
  });

  return {
    templateId,
    version,
    name,
    description,
    ownerUserId: userId ?? null,
    sourceUrl: response.finalUrl || normalizedUrl,
    config,
  };
}
