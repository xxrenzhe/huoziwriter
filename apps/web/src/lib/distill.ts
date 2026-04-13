import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { loadPrompt } from "./prompt-loader";

type DistilledCapture = {
  title: string;
  rawContent: string;
  distilledContent: string;
  sourceUrl?: string | null;
};

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function fetchUrlArticle(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`抓取源链接失败，HTTP ${response.status}`);
  }
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "";
  const rawText = stripHtml(html).slice(0, 12_000);
  if (!rawText) {
    throw new Error("抓取结果为空");
  }
  return {
    title,
    rawText,
  };
}

function fallbackDistill(input: { title?: string | null; rawContent: string }) {
  const text = input.rawContent.replace(/\s+/g, " ").trim();
  const title = (input.title || text.slice(0, 24) || "未命名碎片").trim();
  return {
    title,
    distilledContent: text.slice(0, 400),
  };
}

export async function distillCaptureInput(input: {
  sourceType: "manual" | "url" | "screenshot";
  title?: string | null;
  content?: string | null;
  url?: string | null;
}) {
  let sourceTitle = input.title?.trim() || "";
  let rawContent = input.content?.trim() || "";
  let sourceUrl = input.url?.trim() || null;

  if (input.sourceType === "url") {
    if (!sourceUrl) {
      throw new Error("URL 不能为空");
    }
    const article = await fetchUrlArticle(sourceUrl);
    sourceTitle = sourceTitle || article.title;
    rawContent = article.rawText;
  }

  if (!rawContent) {
    throw new Error("待提纯内容为空");
  }

  const systemPrompt = await loadPrompt("fragment_distill");
  const userPrompt = [
    "请把下面的输入提纯成适合写作系统长期复用的原子事实碎片。",
    "返回 JSON，不要解释，不要 markdown。",
    '字段要求：{"title":"字符串","distilledContent":"字符串"}',
    "distilledContent 只保留时间、地点、数据、动作、冲突，不写空泛判断。",
    `sourceType: ${input.sourceType}`,
    sourceUrl ? `sourceUrl: ${sourceUrl}` : null,
    sourceTitle ? `sourceTitle: ${sourceTitle}` : null,
    "",
    rawContent,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateSceneText({
      sceneCode: "fragmentDistill",
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });
    const payload = extractJsonObject(result.text) as { title?: string; distilledContent?: string };
    const fallback = fallbackDistill({ title: sourceTitle, rawContent });
    return {
      title: (payload.title || fallback.title).trim(),
      rawContent,
      distilledContent: (payload.distilledContent || fallback.distilledContent).trim(),
      sourceUrl,
      model: result.model,
      provider: result.provider,
    } satisfies DistilledCapture & { model: string; provider: string };
  } catch {
    const fallback = fallbackDistill({ title: sourceTitle, rawContent });
    return {
      title: fallback.title,
      rawContent,
      distilledContent: fallback.distilledContent,
      sourceUrl,
      model: "fallback-local-distill",
      provider: "local",
    } satisfies DistilledCapture & { model: string; provider: string };
  }
}
