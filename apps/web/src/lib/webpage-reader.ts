import { fetchExternalText } from "./external-fetch";

function decodeHtml(value: string) {
  return value
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

export async function fetchWebpageArticle(url: string) {
  const response = await fetchExternalText({
    url,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  const html = response.text;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const sourceTitle = titleMatch ? decodeHtml(titleMatch[1].trim()) : "";
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
