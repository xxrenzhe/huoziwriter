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
  const rawText = stripHtml(html).slice(0, 16_000);

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
