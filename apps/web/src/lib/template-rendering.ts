export type TemplateRenderVariant =
  | "plain"
  | "serif"
  | "sharp"
  | "short"
  | "medium"
  | "long"
  | "paper"
  | "scroll"
  | "newsprint"
  | "marker"
  | "underline"
  | "badge"
  | "note"
  | "editorial"
  | "news"
  | "ink"
  | "soft"
  | "terminal"
  | "command"
  | "soft-command"
  | "hairline"
  | "seal"
  | "dots"
  | "compact"
  | "card"
  | "checklist";

export type TemplateRenderDsl = {
  schemaVersion?: string;
  identity?: {
    tone?: string;
    sourceExcerpt?: string;
  };
  layout?: {
    paragraphLength?: string;
    backgroundStyle?: string;
    dividerStyle?: string;
  };
  typography?: {
    titleStyle?: string;
    emphasisStyle?: string;
    quoteStyle?: string;
  };
  blocks?: {
    codeBlockStyle?: string;
    commandBlockStyle?: string;
    recommendationStyle?: string;
  };
  constraints?: {
    bannedWords?: string[];
    bannedPunctuation?: string[];
  };
  extraction?: {
    headingDensity?: number;
    listUsage?: string;
    serifScore?: number;
    strongScore?: number;
    paragraphCount?: number;
    codeBlockCount?: number;
  };
};

export type TemplateRenderConfig = TemplateRenderDsl & {
  tone?: string;
  titleStyle?: string;
  paragraphLength?: string;
  backgroundStyle?: string;
  emphasisStyle?: string;
  quoteStyle?: string;
  codeBlockStyle?: string;
  commandBlockStyle?: string;
  dividerStyle?: string;
  recommendationStyle?: string;
  bannedWords?: string[];
  bannedPunctuation?: string[];
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : undefined;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getLegacyOrNestedString(config: Record<string, unknown>, section: string, key: string) {
  const nested = readRecord(config[section]);
  return readString(nested?.[key]) || readString(config[key]);
}

function getLegacyOrNestedArray(config: Record<string, unknown>, section: string, key: string, limit = 8) {
  const nested = readRecord(config[section]);
  return readStringArray(nested?.[key], limit) || readStringArray(config[key], limit);
}

function inferBackgroundStyle(tone?: string, titleStyle?: string) {
  return tone === "留白专栏" ? "scroll" : tone === "克制报道" || titleStyle === "sharp" ? "newsprint" : "paper";
}

function inferEmphasisStyle(tone?: string, titleStyle?: string) {
  return tone === "降噪净化" ? "badge" : titleStyle === "serif" ? "underline" : "marker";
}

function inferQuoteStyle(tone?: string, titleStyle?: string) {
  return tone === "留白专栏" ? "editorial" : tone === "克制报道" || titleStyle === "sharp" ? "news" : "note";
}

function inferCodeBlockStyle(tone?: string, titleStyle?: string) {
  return tone === "降噪净化" ? "terminal" : titleStyle === "serif" ? "soft" : "ink";
}

function inferCommandBlockStyle(codeBlockStyle?: string, titleStyle?: string) {
  return codeBlockStyle === "terminal" ? "terminal" : titleStyle === "serif" ? "soft-command" : "command";
}

function inferDividerStyle(tone?: string, titleStyle?: string) {
  return titleStyle === "serif" ? "seal" : tone === "降噪净化" ? "dots" : "hairline";
}

function inferRecommendationStyle(tone?: string) {
  return tone === "留白专栏" ? "card" : tone === "降噪净化" ? "checklist" : "compact";
}

export function resolveTemplateRenderConfig(template?: { config?: Record<string, unknown> } | null): TemplateRenderConfig | null {
  if (!template?.config) {
    return null;
  }

  const config = template.config;
  const tone = getLegacyOrNestedString(config, "identity", "tone");
  const titleStyle = getLegacyOrNestedString(config, "typography", "titleStyle");
  const paragraphLength = getLegacyOrNestedString(config, "layout", "paragraphLength");
  const backgroundStyle = getLegacyOrNestedString(config, "layout", "backgroundStyle") || inferBackgroundStyle(tone, titleStyle);
  const emphasisStyle = getLegacyOrNestedString(config, "typography", "emphasisStyle") || inferEmphasisStyle(tone, titleStyle);
  const quoteStyle = getLegacyOrNestedString(config, "typography", "quoteStyle") || inferQuoteStyle(tone, titleStyle);
  const codeBlockStyle = getLegacyOrNestedString(config, "blocks", "codeBlockStyle") || inferCodeBlockStyle(tone, titleStyle);
  const commandBlockStyle =
    getLegacyOrNestedString(config, "blocks", "commandBlockStyle") || inferCommandBlockStyle(codeBlockStyle, titleStyle);
  const dividerStyle = getLegacyOrNestedString(config, "layout", "dividerStyle") || inferDividerStyle(tone, titleStyle);
  const recommendationStyle =
    getLegacyOrNestedString(config, "blocks", "recommendationStyle") || inferRecommendationStyle(tone);
  const bannedWords = getLegacyOrNestedArray(config, "constraints", "bannedWords", 12) || [];
  const bannedPunctuation = getLegacyOrNestedArray(config, "constraints", "bannedPunctuation", 12) || [];
  const extraction = readRecord(config.extraction);

  return {
    schemaVersion: readString(config.schemaVersion) || "v2",
    tone,
    titleStyle,
    paragraphLength,
    backgroundStyle,
    emphasisStyle,
    quoteStyle,
    codeBlockStyle,
    commandBlockStyle,
    dividerStyle,
    recommendationStyle,
    bannedWords,
    bannedPunctuation,
    identity: {
      tone,
      sourceExcerpt: getLegacyOrNestedString(config, "identity", "sourceExcerpt"),
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
      bannedWords,
      bannedPunctuation,
    },
    extraction: extraction
      ? {
          headingDensity: readNumber(extraction.headingDensity),
          listUsage: readString(extraction.listUsage),
          serifScore: readNumber(extraction.serifScore),
          strongScore: readNumber(extraction.strongScore),
          paragraphCount: readNumber(extraction.paragraphCount),
          codeBlockCount: readNumber(extraction.codeBlockCount),
        }
      : {
          headingDensity: readNumber(config.headingDensity),
          listUsage: readString(config.listUsage),
        },
  };
}

export function summarizeTemplateRenderConfig(template?: { config?: Record<string, unknown> } | null, limit = 8) {
  const resolved = resolveTemplateRenderConfig(template);
  if (!resolved) {
    return ["默认微信渲染"];
  }

  return [
    resolved.tone ? `语气：${resolved.tone}` : null,
    resolved.paragraphLength ? `段落：${resolved.paragraphLength}` : null,
    resolved.titleStyle ? `标题：${resolved.titleStyle}` : null,
    resolved.backgroundStyle ? `背景：${resolved.backgroundStyle}` : null,
    resolved.quoteStyle ? `引用：${resolved.quoteStyle}` : null,
    resolved.codeBlockStyle ? `代码：${resolved.codeBlockStyle}` : null,
    resolved.commandBlockStyle ? `命令块：${resolved.commandBlockStyle}` : null,
    resolved.dividerStyle ? `分割：${resolved.dividerStyle}` : null,
    resolved.recommendationStyle ? `推荐区：${resolved.recommendationStyle}` : null,
    resolved.constraints?.bannedWords?.length ? `禁词：${resolved.constraints.bannedWords.slice(0, 3).join(" / ")}` : null,
    resolved.constraints?.bannedPunctuation?.length ? `禁用标点：${resolved.constraints.bannedPunctuation.join(" ")}` : null,
    resolved.extraction?.headingDensity != null ? `标题密度：${resolved.extraction.headingDensity}` : null,
    resolved.extraction?.listUsage ? `列表：${resolved.extraction.listUsage}` : null,
  ].filter(Boolean).slice(0, limit) as string[];
}
