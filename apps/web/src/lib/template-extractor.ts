import { getDatabase } from "./db";
import { fetchExternalText } from "./external-fetch";
import { syncTemplateVersionToLayoutTemplates } from "./layout-templates";
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
  const config = deriveTemplateConfig(html);
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
