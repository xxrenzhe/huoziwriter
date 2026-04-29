import { createHash } from "node:crypto";
import { getDatabase } from "./db";
import { syncTemplateVersionToLayoutTemplates } from "./layout-templates";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type TemplateImportAuditStatus = "passed" | "warning" | "blocked";

export type TemplateImportIssue = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
};

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const namedColors: Record<string, RgbColor> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
};

function parseCssColor(value: string | null | undefined): RgbColor | null {
  const color = String(value || "").trim().toLowerCase();
  if (!color || color === "transparent" || color === "inherit" || color === "currentcolor") return null;
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length === 3
      ? raw.split("").map((char) => `${char}${char}`).join("")
      : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]))),
      g: Math.max(0, Math.min(255, Number(rgb[2]))),
      b: Math.max(0, Math.min(255, Number(rgb[3]))),
    };
  }
  return namedColors[color] ?? null;
}

function getStyleDeclarationValue(style: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = style.match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, "i"));
  return match?.[1]?.trim() || null;
}

function extractInlineStyles(html: string) {
  return [...html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)].map((match) => match[2]);
}

function relativeLuminance(color: RgbColor) {
  const normalize = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * normalize(color.r) + 0.7152 * normalize(color.g) + 0.0722 * normalize(color.b);
}

function contrastRatio(foreground: RgbColor, background: RgbColor) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function getBackgroundColorFromStyle(style: string) {
  const backgroundColor = getStyleDeclarationValue(style, "background-color");
  if (backgroundColor) return backgroundColor;
  const background = getStyleDeclarationValue(style, "background");
  return background?.match(/(?:#[0-9a-f]{3,6}\b|rgba?\([^)]+\)|\b(?:black|white|red|green|blue|gray|grey)\b)/i)?.[0] || null;
}

function countLowContrastInlinePairs(styles: string[]) {
  return styles.reduce((count, style) => {
    const foreground = parseCssColor(getStyleDeclarationValue(style, "color"));
    const background = parseCssColor(getBackgroundColorFromStyle(style));
    if (!foreground || !background) return count;
    return contrastRatio(foreground, background) < 4.5 ? count + 1 : count;
  }, 0);
}

function hashHtml(html: string) {
  return createHash("sha256").update(html).digest("hex").slice(0, 16);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "html-template";
}

function inferTemplateName(input: { name?: string | null; html: string }) {
  const explicit = String(input.name || "").trim();
  if (explicit) return explicit.slice(0, 40);
  const title = stripHtml(input.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  if (title) return title.slice(0, 40);
  const heading = stripHtml(input.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  return (heading || "导入 HTML 模板").slice(0, 40);
}

export function auditImportedHtmlTemplate(html: string) {
  const normalizedHtml = String(html || "").trim();
  const text = stripHtml(normalizedHtml);
  const issues: TemplateImportIssue[] = [];
  const scriptCount = countMatches(normalizedHtml, /<script\b/gi);
  const externalStylesheetCount = countMatches(normalizedHtml, /<link\b[^>]*rel=["']?stylesheet["']?[^>]*href=["']?https?:\/\//gi);
  const eventHandlerCount = countMatches(normalizedHtml, /\son[a-z]+\s*=/gi);
  const remoteImageCount = countMatches(normalizedHtml, /<img\b[^>]*src=["']?https?:\/\//gi);
  const fixedWideCount = countMatches(normalizedHtml, /(?:width|min-width)\s*:\s*(?:[7-9]\d{2}|[1-9]\d{3,})px/gi);
  const paragraphCount = countMatches(normalizedHtml, /<p[\s>]/gi);
  const imageCount = countMatches(normalizedHtml, /<img\b/gi);
  const inlineStyles = extractInlineStyles(normalizedHtml);
  const lowContrastPairCount = countLowContrastInlinePairs(inlineStyles);
  const explicitColorStyleCount = inlineStyles.filter((style) => /(?:^|;)\s*(?:color|background(?:-color)?)\s*:/i.test(style)).length;
  const hasDarkModeSupport = /prefers-color-scheme|color-scheme\s*:/i.test(normalizedHtml);
  const firstVisualIndex = normalizedHtml.search(/<(?:img|figure|h2|h3|blockquote|hr)\b/i);
  const firstScreenText = stripHtml(firstVisualIndex >= 0 ? normalizedHtml.slice(0, firstVisualIndex) : normalizedHtml);
  const averageParagraphLength = paragraphCount > 0 ? Math.round(text.length / paragraphCount) : text.length;
  const maxReasonableImageCount = Math.max(4, Math.ceil(text.length / 250));

  if (!normalizedHtml || text.length < 20) {
    issues.push({
      code: "template_content_too_short",
      severity: "blocking",
      message: "HTML 正文内容过少，无法提取为可复用微信模板。",
    });
  }
  if (scriptCount > 0) {
    issues.push({
      code: "external_script_blocked",
      severity: "blocking",
      message: "模板包含 script 标签，不能导入为微信发布模板。",
    });
  }
  if (externalStylesheetCount > 0) {
    issues.push({
      code: "external_stylesheet_blocked",
      severity: "blocking",
      message: "模板引用外部 CSS，微信发布前无法保证样式稳定。",
    });
  }
  if (eventHandlerCount > 0) {
    issues.push({
      code: "inline_event_handler_blocked",
      severity: "blocking",
      message: "模板包含 onClick/onLoad 等事件属性，不能进入发布链路。",
    });
  }
  if (fixedWideCount > 0) {
    issues.push({
      code: "mobile_width_risk",
      severity: "warning",
      message: "模板存在超过移动端宽度的固定宽度样式，导入后需要在预览中确认。",
    });
  }
  if (remoteImageCount > 0) {
    issues.push({
      code: "remote_image_risk",
      severity: "warning",
      message: "模板包含远程图片，发布前需要进入资产库或由微信素材上传流程接管。",
    });
  }
  if (lowContrastPairCount > 0) {
    issues.push({
      code: "low_contrast_risk",
      severity: "warning",
      message: "模板存在文字和背景对比度偏低的样式，手机端阅读可能吃力。",
    });
  }
  if (explicitColorStyleCount >= 3 && !hasDarkModeSupport) {
    issues.push({
      code: "dark_mode_risk",
      severity: "warning",
      message: "模板使用较多固定颜色，但没有暗色模式适配信号，微信深色环境下需要预览确认。",
    });
  }
  if (firstScreenText.length > 320) {
    issues.push({
      code: "first_screen_dense_risk",
      severity: "warning",
      message: "首屏正文过长，读者进入文章后可能看不到明显的分段、图片或小标题。",
    });
  }
  if (paragraphCount > 0 && averageParagraphLength > 220) {
    issues.push({
      code: "paragraph_density_risk",
      severity: "warning",
      message: "模板段落平均长度偏高，移动端阅读节奏可能过密。",
    });
  }
  if (text.length >= 1200 && imageCount === 0) {
    issues.push({
      code: "image_density_low_risk",
      severity: "warning",
      message: "长文模板没有图片槽位，商业案例或工具评测类文章的停顿点不足。",
    });
  }
  if (imageCount > maxReasonableImageCount) {
    issues.push({
      code: "image_density_high_risk",
      severity: "warning",
      message: "模板图片密度偏高，发布前需要确认图片都来自可上传资产。",
    });
  }

  const status: TemplateImportAuditStatus = issues.some((issue) => issue.severity === "blocking")
    ? "blocked"
    : issues.some((issue) => issue.severity === "warning")
      ? "warning"
      : "passed";

  return {
    status,
    issues,
    summary: {
      textLength: text.length,
      paragraphCount,
      imageCount,
      remoteImageCount,
      fixedWideCount,
      scriptCount,
      externalStylesheetCount,
      lowContrastPairCount,
      explicitColorStyleCount,
      darkModeRisk: explicitColorStyleCount >= 3 && !hasDarkModeSupport,
      firstScreenTextLength: firstScreenText.length,
      averageParagraphLength,
      maxReasonableImageCount,
      contentPreview: text.slice(0, 160),
    },
  };
}

function buildTemplateConfig(input: {
  html: string;
  audit: ReturnType<typeof auditImportedHtmlTemplate>;
}) {
  const paragraphLength =
    input.audit.summary.paragraphCount >= 10 ? "short" : input.audit.summary.paragraphCount >= 5 ? "medium" : "long";
  const hasSerif = /font-family:[^;"']*(serif|Georgia|Times|Noto Serif)/i.test(input.html);
  const hasStrong = countMatches(input.html, /<(strong|b)[\s>]/gi) >= 4;
  const hasQuote = /<blockquote[\s>]/i.test(input.html);
  return {
    schemaVersion: "v2",
    identity: {
      tone: hasStrong ? "强对比评论" : hasSerif ? "留白专栏" : "克制报道",
      sourceExcerpt: input.audit.summary.contentPreview,
    },
    layout: {
      paragraphLength,
      backgroundStyle: hasSerif ? "scroll" : "paper",
      dividerStyle: hasSerif ? "seal" : "hairline",
    },
    typography: {
      titleStyle: hasSerif ? "serif" : hasStrong ? "sharp" : "plain",
      emphasisStyle: hasStrong ? "marker" : "badge",
      quoteStyle: hasQuote ? "editorial" : "note",
    },
    blocks: {
      codeBlockStyle: /<pre[\s>]/i.test(input.html) ? "ink" : "soft",
      commandBlockStyle: "soft-command",
      recommendationStyle: "compact",
    },
    extraction: input.audit.summary,
    experience: {
      darkModeRisk: input.audit.summary.darkModeRisk,
      firstScreenTextLength: input.audit.summary.firstScreenTextLength,
      averageParagraphLength: input.audit.summary.averageParagraphLength,
      lowContrastPairCount: input.audit.summary.lowContrastPairCount,
      imageCount: input.audit.summary.imageCount,
    },
  };
}

async function insertTemplateImportAudit(input: {
  templateId: string;
  version: string;
  userId: number;
  status: TemplateImportAuditStatus;
  issues: TemplateImportIssue[];
  summary: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await getDatabase().exec(
    `INSERT INTO layout_template_import_audits (
      template_id, version, user_id, status, issues_json, summary_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.templateId,
      input.version,
      input.userId,
      input.status,
      JSON.stringify(input.issues),
      JSON.stringify(input.summary),
      now,
    ],
  );
}

export async function importHtmlTemplate(input: {
  userId: number;
  html: string;
  name?: string | null;
  sourceUrl?: string | null;
}) {
  await ensureExtendedProductSchema();
  const audit = auditImportedHtmlTemplate(input.html);
  const name = inferTemplateName({ name: input.name, html: input.html });
  const templateId = `html-${input.userId}-${slugify(name)}-${hashHtml(input.html)}`;
  const version = "v1.0.0";
  const sourceUrl = String(input.sourceUrl || "").trim() || null;

  if (audit.status === "blocked") {
    await insertTemplateImportAudit({
      templateId,
      version,
      userId: input.userId,
      status: audit.status,
      issues: audit.issues,
      summary: {
        ...audit.summary,
        sourceUrl,
        imported: false,
      },
    });
    return {
      imported: false,
      templateId,
      version,
      name,
      audit,
    };
  }

  const config = buildTemplateConfig({ html: input.html, audit });
  await syncTemplateVersionToLayoutTemplates({
    templateId,
    version,
    ownerUserId: input.userId,
    name,
    description: `从 HTML 导入的私有微信模板，导入审计状态：${audit.status}。`,
    sourceUrl,
    meta: "导入模板",
    config,
    isActive: true,
  });
  await insertTemplateImportAudit({
    templateId,
    version,
    userId: input.userId,
    status: audit.status,
    issues: audit.issues,
    summary: {
      ...audit.summary,
      sourceUrl,
      imported: true,
    },
  });

  return {
    imported: true,
    templateId,
    version,
    name,
    config,
    audit,
  };
}

export async function getLatestTemplateImportAudit(input: {
  userId: number;
  templateId: string;
}) {
  await ensureExtendedProductSchema();
  const row = await getDatabase().queryOne<{
    template_id: string;
    version: string;
    status: TemplateImportAuditStatus;
    issues_json: string | TemplateImportIssue[] | null;
    summary_json: string | Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT template_id, version, status, issues_json, summary_json, created_at
     FROM layout_template_import_audits
     WHERE user_id = ? AND template_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [input.userId, input.templateId],
  );
  if (!row) return null;
  const parseJson = <T>(value: unknown, fallback: T): T => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value && typeof value === "object" ? value as T : fallback;
  };
  return {
    templateId: row.template_id,
    version: row.version,
    status: row.status,
    issues: parseJson<TemplateImportIssue[]>(row.issues_json, []),
    summary: parseJson<Record<string, unknown>>(row.summary_json, {}),
    createdAt: row.created_at,
  };
}
