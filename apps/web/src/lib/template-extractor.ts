import { getDatabase } from "./db";

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
  const serifScore = countMatches(html, /font-family:[^;"']*(serif|Georgia|Times|Noto Serif)/gi);
  const strongScore = countMatches(html, /<(strong|b)[\s>]/gi);

  return {
    tone: strongScore > 8 ? "强对比评论" : "克制报道",
    paragraphLength: paragraphCount >= 10 ? "short" : paragraphCount >= 5 ? "medium" : "long",
    titleStyle: serifScore > 0 ? "serif" : headingCount > 2 ? "sharp" : "plain",
    headingDensity: headingCount,
    listUsage: listCount > 0 ? "structured" : "freeform",
    sourceExcerpt: text.slice(0, 160),
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

export async function extractTemplateFromUrl(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`模板源页面抓取失败，HTTP ${response.status}`);
  }

  const html = await response.text();
  const pageUrl = new URL(url);
  const title = extractTitle(html);
  const config = deriveTemplateConfig(html);
  const db = getDatabase();
  const now = new Date().toISOString();
  const templateId = `external-${pageUrl.hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
  const version = "v1.0.0";
  const name = deriveTemplateName(title, pageUrl.hostname);
  const description = `从 ${pageUrl.hostname} 实页结构提取的版式候选，适合继续人工微调后复用。`;

  await db.exec(
    `INSERT INTO template_versions (template_id, version, name, description, config_json, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [templateId, version, name, description, config, true, now],
  );

  return {
    templateId,
    version,
    name,
    description,
    sourceUrl: url,
    config,
  };
}
