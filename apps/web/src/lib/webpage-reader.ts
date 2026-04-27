import { fetchExternalText } from "./external-fetch";

function decodeHtml(value: string) {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function stripHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function collectSectionMatches(html: string, pattern: RegExp, contentGroupIndex = 1) {
  return Array.from(html.matchAll(pattern))
    .map((match) => stripHtml(match[contentGroupIndex] || ""))
    .filter(Boolean);
}

function extractAttribute(tag: string, name: string) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return decodeHtml(tag.match(pattern)?.[2]?.trim() || "");
}

function extractMetaContent(html: string, keys: string[]) {
  const wanted = new Set(keys.map((item) => item.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (extractAttribute(tag, "property") || extractAttribute(tag, "name")).toLowerCase();
    if (wanted.has(key)) {
      const content = extractAttribute(tag, "content");
      if (content) return content;
    }
  }
  return "";
}

function extractScriptString(html: string, variableName: string) {
  const pattern = new RegExp(`(?:var\\s+)?${variableName}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i");
  return decodeHtml(html.match(pattern)?.[2]?.trim() || "");
}

function extractBalancedElement(html: string, tagName: string, startIndex: number) {
  const tagPattern = new RegExp(`</?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const tag = match[0];
    const isClosing = /^<\//.test(tag);
    const isSelfClosing = /\/>$/.test(tag);
    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startIndex, tagPattern.lastIndex);
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }
  }
  return "";
}

function collectBalancedSectionMatches(html: string, tagName: string, attributePattern: RegExp) {
  const startTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = startTagPattern.exec(html))) {
    if (!attributePattern.test(match[0])) {
      continue;
    }
    const sectionHtml = extractBalancedElement(html, tagName, match.index);
    const text = stripHtml(sectionHtml);
    if (text) {
      matches.push(text);
    }
  }
  return matches;
}

function scoreCandidate(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  const lengthScore = Math.min(normalized.length, 6000);
  const paragraphSignals = (normalized.match(/[。！？!?；;]/g) || []).length * 12;
  const dataSignals = (normalized.match(/\d/g) || []).length * 2;
  return lengthScore + paragraphSignals + dataSignals;
}

function extractArticleBodyText(html: string) {
  const wechatCandidates = [
    ...collectBalancedSectionMatches(html, "div", /\bid\s*=\s*["']js_content["']/i),
    ...collectBalancedSectionMatches(html, "div", /\bclass\s*=\s*["'][^"']*(?:rich_media_content|js_underline_content)[^"']*["']/i),
  ].filter((text) => text.length >= 80);
  if (wechatCandidates.length > 0) {
    return wechatCandidates
      .map((text) => ({ text, score: scoreCandidate(text) }))
      .sort((left, right) => right.score - left.score)[0]?.text || "";
  }

  const candidates = [
    ...collectSectionMatches(html, /<article\b[^>]*>([\s\S]*?)<\/article>/gi),
    ...collectSectionMatches(html, /<main\b[^>]*>([\s\S]*?)<\/main>/gi),
    ...collectSectionMatches(
      html,
      /<(section|div)\b[^>]*(?:id|class)=["'][^"']*(?:content|article|post|entry|main|detail|正文)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
      2,
    ),
  ].filter((text) => text.length >= 180);

  const best = candidates
    .map((text) => ({ text, score: scoreCandidate(text) }))
    .sort((left, right) => right.score - left.score)[0];

  return best?.text || "";
}

function extractSourceTitle(html: string) {
  const title =
    extractMetaContent(html, ["og:title", "twitter:title", "article:title"])
    || extractScriptString(html, "msg_title")
    || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "");
  return title.replace(/\s+/g, " ").trim();
}

export async function fetchWebpageArticle(url: string) {
  const response = await fetchExternalText({
    url,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  const html = response.text;
  const sourceTitle = extractSourceTitle(html);
  const articleBody = extractArticleBodyText(html);
  const rawText = (articleBody || stripHtml(html)).slice(0, 16_000);

  if (!rawText) {
    throw new Error("文章正文抓取为空");
  }

  return {
    url: response.finalUrl,
    html,
    sourceTitle,
    rawText,
  };
}
