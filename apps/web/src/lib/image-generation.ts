import { getGlobalCoverImageEngineSecret, updateGlobalCoverImageEngineHealth } from "./image-engine";
import { buildVisualAuthoringDirective, type ImageAuthoringStyleContext } from "./image-authoring-context";

type ImageProvider = "openai" | "custom";
type ImageRequestMode = "generations" | "edits" | "chatCompletions" | "geminiGenerateContent";
const GEMINI_NATIVE_IMAGE_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const GEMINI_NATIVE_IMAGE_RETRY_DELAYS_MS = [250, 800];

function resolveOutputSize(outputResolution?: string | null) {
  const normalized = String(outputResolution || process.env.COVER_IMAGE_OUTPUT_RESOLUTION || "1K").trim().toLowerCase();
  if (!normalized) {
    return "1024x1024";
  }
  if (normalized === "1k" || normalized === "1024" || normalized === "1024x1024") {
    return "1024x1024";
  }
  if (normalized === "1k-landscape" || normalized === "landscape" || normalized === "1536x1024") {
    return "1536x1024";
  }
  if (normalized === "1k-portrait" || normalized === "portrait" || normalized === "1024x1536") {
    return "1024x1536";
  }
  if (/^\d{3,4}x\d{3,4}$/.test(normalized)) {
    return normalized;
  }
  return "1024x1024";
}

function isOfficialOpenAiBaseUrl(baseUrl: string) {
  return /(^https:\/\/api\.openai\.com(?:\/|$))/i.test(String(baseUrl || "").trim());
}

function buildUnsupportedOpenAiImageEndpointMessage(baseUrl: string) {
  return `当前图片网关不支持 OpenAI 图片接口：${baseUrl}。请单独配置 COVER_IMAGE_BASE_URL / COVER_IMAGE_API_KEY，或改用支持 /images/generations 的图片网关。`;
}

function buildHtmlShellImageEndpointMessage(baseUrl: string) {
  return `当前图片接口返回的是站点 HTML，而不是图片 API 响应：${baseUrl}。请检查 COVER_IMAGE_BASE_URL 是否指向真实生图接口，而不是网站首页。`;
}

function buildExhaustedImageAccountsMessage(model: string, baseUrl: string) {
  return `当前图片服务的可用上游账号已耗尽，暂时无法继续生图。模型：${model}；网关：${baseUrl}。这通常不是提示词或接口地址错误，请稍后重试；如果持续出现，请在后台补充可用图片账号或切换图片网关。`;
}

function isChatImagePreviewModel(model: string) {
  return /image-preview/i.test(String(model || "").trim());
}

function isGeminiNativeBaseUrl(baseUrl: string) {
  return /\/v1beta(?:\/|$)/i.test(String(baseUrl || "").trim());
}

function shouldUseGeminiNativeGenerateContent(input: {
  providerName?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}) {
  return (
    resolveImageProvider(input) === "custom"
    && isGeminiNativeBaseUrl(String(input.baseUrl || ""))
    && /^gemini-/i.test(String(input.model || "").trim())
  );
}

function buildImagePrompt(
  title: string,
  hasReferenceImage: boolean,
  variantLabel?: string,
  authoringContext?: ImageAuthoringStyleContext | null,
) {
  const variantLine =
    variantLabel === "叙事纪实"
      ? "画面偏纪实、硬新闻、轻微高反差，主体更明确。"
      : variantLabel === "留白商业"
        ? "画面偏留白、商业摄影、纸张肌理，更适合公众号封面。"
        : "";
  const authoringLine = buildVisualAuthoringDirective(authoringContext, "cover");
  return `为一篇中文内容产品封面生成 16:9 图片。标题：${title}。要求：克制、新中式、留白、适合商业与写作类文章封面，不出现水印，不要密集文字，只保留高辨识度主体。${variantLine}${authoringLine ? `${authoringLine}` : ""}${
    hasReferenceImage ? "已提供参考图，请尽量继承它的主体、构图、色调或笔触线索，但不要机械照抄。" : ""
  }`;
}

function resolveImageProvider(input: {
  providerName?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}): ImageProvider {
  const providerName = String(input.providerName || "").trim().toLowerCase();
  const baseUrl = String(input.baseUrl || "").trim().toLowerCase();
  const model = String(input.model || "").trim().toLowerCase();
  if (providerName === "openai" || baseUrl.includes("api.openai.com") || model.startsWith("gpt-image")) {
    return "openai";
  }
  return "custom";
}

function resolveImageEndpoint(baseUrl: string, mode: ImageRequestMode) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (mode === "geminiGenerateContent") {
    return normalizedBaseUrl;
  }
  if (mode === "chatCompletions") {
    if (/\/chat\/completions$/i.test(normalizedBaseUrl)) {
      return normalizedBaseUrl;
    }
    if (/\/v1$/i.test(normalizedBaseUrl)) {
      return `${normalizedBaseUrl}/chat/completions`;
    }
    return `${normalizedBaseUrl}/chat/completions`;
  }
  if (/\/images\/(generations|edits)$/.test(normalizedBaseUrl)) {
    return normalizedBaseUrl.replace(/\/images\/(generations|edits)$/, `/images/${mode}`);
  }
  if (normalizedBaseUrl.endsWith("/images")) {
    return `${normalizedBaseUrl}/${mode}`;
  }
  return `${normalizedBaseUrl}/images/${mode}`;
}

function resolveRetryImageEndpoint(baseUrl: string, mode: ImageRequestMode) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    return null;
  }
  try {
    const url = new URL(normalizedBaseUrl);
    if (url.pathname && url.pathname !== "/") {
      return null;
    }
    return resolveImageEndpoint(`${normalizedBaseUrl}/v1`, mode);
  } catch {
    return null;
  }
}

function detectImageExtension(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes("jpeg")) return "jpg";
  if (normalizedMimeType.includes("webp")) return "webp";
  if (normalizedMimeType.includes("gif")) return "gif";
  return "png";
}

function decodeImageDataUrl(dataUrl: string) {
  const matched = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matched) {
    throw new Error("参考图格式不合法，必须是 data:image/* 数据");
  }
  const mimeType = matched[1];
  const buffer = Buffer.from(matched[2], "base64");
  return {
    mimeType,
    buffer,
    filename: `reference.${detectImageExtension(mimeType)}`,
  };
}

function buildLegacyImageRequestPayload(input: {
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl?: string | null;
}) {
  const requestPayload: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size: input.size,
    n: 1,
    response_format: "b64_json",
  };
  if (input.referenceImageDataUrl) {
    requestPayload.image = input.referenceImageDataUrl;
    requestPayload.reference_image = input.referenceImageDataUrl;
    requestPayload.input_image = input.referenceImageDataUrl;
    requestPayload.image_url = input.referenceImageDataUrl;
    requestPayload.reference_strength = 0.65;
  }
  return requestPayload;
}

function buildChatImagePreviewRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl?: string | null;
}) {
  const content: Array<Record<string, unknown>> = [];
  if (input.referenceImageDataUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: input.referenceImageDataUrl,
      },
    });
  }
  content.push({
    type: "text",
    text: `${input.prompt}\n输出分辨率：${input.size}。请直接返回图片结果，优先返回可访问的图片 URL。`,
  });

  const requestInit: RequestInit = {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    }),
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "user",
          content,
        },
      ],
      stream: false,
      size: input.size,
    }),
  };

  return {
    endpoint: resolveImageEndpoint(input.baseUrl, "chatCompletions"),
    requestInit,
    mode: "chatCompletions" as const,
  };
}

function buildGeminiGenerateContentEndpoint(baseUrl: string, model: string, apiKey: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const appendApiKey = (url: string) => `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(apiKey)}`;

  if (/\/models\/[^/?#:]+:generateContent$/i.test(normalizedBaseUrl)) {
    return appendApiKey(normalizedBaseUrl);
  }
  if (/\/models\/[^/?#:]+$/i.test(normalizedBaseUrl)) {
    return appendApiKey(`${normalizedBaseUrl}:generateContent`);
  }
  if (/\/models$/i.test(normalizedBaseUrl)) {
    return appendApiKey(`${normalizedBaseUrl}/${encodeURIComponent(model)}:generateContent`);
  }
  return appendApiKey(`${normalizedBaseUrl}/models/${encodeURIComponent(model)}:generateContent`);
}

function buildGeminiImageRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl?: string | null;
}) {
  const parts: Array<Record<string, unknown>> = [];
  if (input.referenceImageDataUrl) {
    const referenceImage = decodeImageDataUrl(input.referenceImageDataUrl);
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.buffer.toString("base64"),
      },
    });
  }
  parts.push({
    text: `${input.prompt}\n输出分辨率：${input.size}。请直接返回图片结果，并在可行时附带一句简短图像说明。`,
  });

  const requestInit: RequestInit = {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey,
      Authorization: `Bearer ${input.apiKey}`,
    }),
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  };

  return {
    endpoint: buildGeminiGenerateContentEndpoint(input.baseUrl, input.model, input.apiKey),
    requestInit,
    mode: "geminiGenerateContent" as const,
  };
}

function buildOpenAiImageRequest(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl?: string | null;
}) {
  if (!input.referenceImageDataUrl) {
    const requestInit: RequestInit = {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      }),
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        n: 1,
        output_format: "png",
      }),
    };
    return {
      endpoint: resolveImageEndpoint(input.baseUrl, "generations"),
      requestInit,
    };
  }

  const referenceImage = decodeImageDataUrl(input.referenceImageDataUrl);
  const formData = new FormData();
  formData.append("model", input.model);
  formData.append("prompt", input.prompt);
  formData.append("size", input.size);
  formData.append("n", "1");
  formData.append("output_format", "png");
  formData.append(
    "image",
    new Blob([referenceImage.buffer], { type: referenceImage.mimeType }),
    referenceImage.filename,
  );

  const requestInit: RequestInit = {
    method: "POST",
    headers: new Headers({
      Authorization: `Bearer ${input.apiKey}`,
    }),
    body: formData,
  };

  return {
    endpoint: resolveImageEndpoint(input.baseUrl, "edits"),
    requestInit,
  };
}

function buildImageRequest(input: {
  providerName?: string | null;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  referenceImageDataUrl?: string | null;
}) {
  if (resolveImageProvider(input) === "custom" && isChatImagePreviewModel(input.model)) {
    if (shouldUseGeminiNativeGenerateContent(input)) {
      return buildGeminiImageRequest(input);
    }
    return buildChatImagePreviewRequest(input);
  }
  if (shouldUseGeminiNativeGenerateContent(input)) {
    return buildGeminiImageRequest(input);
  }
  if (resolveImageProvider(input) === "openai") {
    return {
      ...buildOpenAiImageRequest(input),
      mode: input.referenceImageDataUrl ? ("edits" as const) : ("generations" as const),
    };
  }
  const requestInit: RequestInit = {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    }),
    body: JSON.stringify(
      buildLegacyImageRequestPayload({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        referenceImageDataUrl: input.referenceImageDataUrl,
      }),
    ),
  };
  return {
    endpoint: resolveImageEndpoint(input.baseUrl, "generations"),
    requestInit,
    mode: "generations" as const,
  };
}

function extractImageUrl(payload: any) {
  const candidates = [
    payload?.data?.[0]?.url,
    payload?.data?.data?.[0]?.url,
    payload?.images?.[0]?.url,
    payload?.data?.images?.[0]?.url,
    payload?.output?.[0]?.url,
    payload?.data?.output?.[0]?.url,
    payload?.imageUrl,
    payload?.data?.imageUrl,
  ];
  const url = candidates.find((item) => typeof item === "string" && item.length > 0);
  if (url) {
    return url;
  }

  const base64Candidates = [
    payload?.data?.[0]?.b64_json,
    payload?.data?.data?.[0]?.b64_json,
    payload?.images?.[0]?.b64_json,
    payload?.data?.images?.[0]?.b64_json,
    payload?.output?.[0]?.b64_json,
    payload?.data?.output?.[0]?.b64_json,
    payload?.b64_json,
    payload?.data?.b64_json,
  ];
  const b64 = base64Candidates.find((item) => typeof item === "string" && item.length > 0);
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }

  const chatMatch = extractChatImageArtifacts(payload)[0];
  if (chatMatch) {
    return chatMatch;
  }

  return null;
}

function extractImageUrls(payload: any) {
  const urlCandidates = [
    ...(Array.isArray(payload?.data) ? payload.data.map((item: any) => item?.url) : []),
    ...(Array.isArray(payload?.data?.data) ? payload.data.data.map((item: any) => item?.url) : []),
    ...(Array.isArray(payload?.images) ? payload.images.map((item: any) => item?.url) : []),
    ...(Array.isArray(payload?.data?.images) ? payload.data.images.map((item: any) => item?.url) : []),
    ...(Array.isArray(payload?.output) ? payload.output.map((item: any) => item?.url) : []),
    ...(Array.isArray(payload?.data?.output) ? payload.data.output.map((item: any) => item?.url) : []),
    payload?.imageUrl,
    payload?.data?.imageUrl,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  if (urlCandidates.length > 0) {
    return urlCandidates;
  }

  const base64Candidates = [
    ...(Array.isArray(payload?.data) ? payload.data.map((item: any) => item?.b64_json) : []),
    ...(Array.isArray(payload?.data?.data) ? payload.data.data.map((item: any) => item?.b64_json) : []),
    ...(Array.isArray(payload?.images) ? payload.images.map((item: any) => item?.b64_json) : []),
    ...(Array.isArray(payload?.data?.images) ? payload.data.images.map((item: any) => item?.b64_json) : []),
    ...(Array.isArray(payload?.output) ? payload.output.map((item: any) => item?.b64_json) : []),
    ...(Array.isArray(payload?.data?.output) ? payload.data.output.map((item: any) => item?.b64_json) : []),
    payload?.b64_json,
    payload?.data?.b64_json,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  if (base64Candidates.length > 0) {
    return base64Candidates.map((item) => `data:image/png;base64,${item}`);
  }
  return extractChatImageArtifacts(payload);
}

function extractImageUrlCandidatesFromText(text: string) {
  const matched = new Set<string>();
  const markdownImagePattern = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/gi;
  for (const item of text.matchAll(markdownImagePattern)) {
    if (item[1]) {
      matched.add(item[1]);
    }
  }
  const dataUrlPattern = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
  for (const item of text.matchAll(dataUrlPattern)) {
    matched.add(item[0]);
  }
  const urlPattern = /https?:\/\/[^\s)"'<>]+/gi;
  for (const item of text.matchAll(urlPattern)) {
    matched.add(item[0]);
  }
  return [...matched];
}

function extractChatImageArtifacts(value: any, seen = new Set<any>()): string[] {
  if (value == null) {
    return [];
  }
  if (typeof value === "string") {
    return extractImageUrlCandidatesFromText(value);
  }
  if (typeof value !== "object") {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const directMatches = [
    typeof value.url === "string" ? value.url : null,
    typeof value.imageUrl === "string" ? value.imageUrl : null,
    typeof value.image_url === "string" ? value.image_url : null,
    typeof value.image_url?.url === "string" ? value.image_url.url : null,
    typeof value.output_image?.url === "string" ? value.output_image.url : null,
    typeof value.inlineData?.data === "string"
      ? `data:${typeof value.inlineData?.mimeType === "string" ? value.inlineData.mimeType : "image/png"};base64,${value.inlineData.data}`
      : null,
    typeof value.inline_data?.data === "string"
      ? `data:${typeof value.inline_data?.mimeType === "string" ? value.inline_data.mimeType : typeof value.inline_data?.mime_type === "string" ? value.inline_data.mime_type : "image/png"};base64,${value.inline_data.data}`
      : null,
    typeof value.b64_json === "string" ? `data:image/png;base64,${value.b64_json}` : null,
    typeof value.data === "string" && /^data:image\//i.test(value.data) ? value.data : null,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  if (directMatches.length > 0) {
    return directMatches;
  }

  const nestedValues = [
    value.text,
    value.content,
    value.parts,
    value.message,
    value.output,
    value.response,
    value.responses,
    value.candidates,
    value.choices,
    value.data,
    value.items,
    value.result,
  ];
  return nestedValues.flatMap((item) => {
    if (Array.isArray(item)) {
      return item.flatMap((entry) => extractChatImageArtifacts(entry, seen));
    }
    return extractChatImageArtifacts(item, seen);
  });
}

function resolveErrorMessage(payload: any, fallbackText: string) {
  if (payload?.error?.message) return String(payload.error.message);
  if (payload?.message) return String(payload.message);
  return fallbackText;
}

function isExhaustedImageAccountsMessage(message: string) {
  return /all available accounts exhausted|accounts? exhausted/i.test(String(message || "").trim());
}

function resolveImageRequestFailureMessage(input: {
  providerName?: string | null;
  baseUrl: string;
  endpoint: string;
  response: Response;
  payload: any;
  model?: string | null;
}) {
  if (
    resolveImageProvider(input) === "openai"
    && !isOfficialOpenAiBaseUrl(input.baseUrl)
    && input.endpoint.includes("/images/")
    && input.response.status === 404
  ) {
    return buildUnsupportedOpenAiImageEndpointMessage(input.baseUrl);
  }
  const message = resolveErrorMessage(input.payload, `生图引擎请求失败，HTTP ${input.response.status}`);
  if (isExhaustedImageAccountsMessage(message)) {
    return buildExhaustedImageAccountsMessage(String(input.model || "unknown"), input.baseUrl);
  }
  return message;
}

async function readImageResponse(response: Response) {
  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = { raw: responseText };
  }
  return {
    responseText,
    payload,
    contentType: String(response.headers.get("content-type") || "").toLowerCase(),
  };
}

function resolveMissingImageFieldMessage(input: {
  providerName?: string | null;
  baseUrl: string;
  contentType: string;
  payload: any;
}) {
  if (input.contentType.includes("text/html")) {
    return buildHtmlShellImageEndpointMessage(input.baseUrl);
  }
  if (resolveImageProvider(input) === "openai" && !isOfficialOpenAiBaseUrl(input.baseUrl)) {
    return buildUnsupportedOpenAiImageEndpointMessage(input.baseUrl);
  }
  if (typeof input.payload?.raw === "string" && /<!doctype html>|<html/i.test(input.payload.raw)) {
    return buildHtmlShellImageEndpointMessage(input.baseUrl);
  }
  return "生图引擎返回成功，但未发现图片结果字段";
}

function shouldRetryOpenAiImageRequest(input: {
  providerName?: string | null;
  baseUrl: string;
  endpoint: string;
  retryEndpoint: string | null;
  response: Response;
  contentType: string;
  payload: any;
}) {
  const provider = resolveImageProvider(input);
  const supportsRetry =
    provider === "openai"
    || (provider === "custom" && input.endpoint.includes("/chat/completions"));
  if (!supportsRetry || !input.retryEndpoint || input.endpoint === input.retryEndpoint) {
    return false;
  }
  if (!input.response.ok) {
    return input.response.status === 404;
  }
  if (input.contentType.includes("text/html")) {
    return true;
  }
  return !extractImageUrl(input.payload) && !extractImageUrls(input.payload).length;
}

function parseRetryAfterMs(response: Response) {
  const header = String(response.headers.get("retry-after") || "").trim();
  if (!header) {
    return null;
  }
  if (/^\d+$/.test(header)) {
    return Number(header) * 1000;
  }
  const timestamp = Date.parse(header);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.max(0, timestamp - Date.now());
}

function shouldRetryGeminiNativeImageRequest(input: {
  mode: ImageRequestMode;
  response: Response;
  payload: any;
  attemptCount: number;
}) {
  if (input.mode !== "geminiGenerateContent" || input.attemptCount >= 3) {
    return false;
  }
  const message = resolveErrorMessage(input.payload, "");
  if (isExhaustedImageAccountsMessage(message)) {
    return false;
  }
  return GEMINI_NATIVE_IMAGE_RETRYABLE_STATUS_CODES.has(input.response.status);
}

function resolveGeminiNativeRetryDelayMs(response: Response, retryIndex: number) {
  const retryAfterMs = parseRetryAfterMs(response);
  if (typeof retryAfterMs === "number") {
    return Math.min(Math.max(retryAfterMs, 0), 5000);
  }
  return GEMINI_NATIVE_IMAGE_RETRY_DELAYS_MS[Math.min(retryIndex, GEMINI_NATIVE_IMAGE_RETRY_DELAYS_MS.length - 1)] || 800;
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageWithRetry(input: {
  providerName?: string | null;
  baseUrl: string;
  endpoint: string;
  requestInit: RequestInit;
  mode: ImageRequestMode;
}) {
  const attempt = async (endpoint: string) => {
    const response = await fetch(endpoint, {
      ...input.requestInit,
      signal: AbortSignal.timeout(60_000),
    });
    const parsed = await readImageResponse(response);
    return {
      endpoint,
      response,
      ...parsed,
    };
  };

  const first = await attempt(input.endpoint);
  const retryEndpoint = resolveRetryImageEndpoint(input.baseUrl, input.mode);
  if (!shouldRetryOpenAiImageRequest({
    providerName: input.providerName,
    baseUrl: input.baseUrl,
    endpoint: input.endpoint,
    retryEndpoint,
    response: first.response,
    contentType: first.contentType,
      payload: first.payload,
  })) {
    let latest = first;
    let retryIndex = 0;
    while (shouldRetryGeminiNativeImageRequest({
      mode: input.mode,
      response: latest.response,
      payload: latest.payload,
      attemptCount: retryIndex + 1,
    })) {
      await sleep(resolveGeminiNativeRetryDelayMs(latest.response, retryIndex));
      latest = await attempt(input.endpoint);
      retryIndex += 1;
    }
    return latest;
  }
  return attempt(retryEndpoint!);
}

export async function generateCoverImage(input: {
  title: string;
  referenceImageDataUrl?: string | null;
  authoringContext?: ImageAuthoringStyleContext | null;
  outputResolution?: string | null;
}) {
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
    throw new Error("请先由运营后台在后台配置全局生图 AI 引擎的 Base_URL 和 API Key");
  }

  const prompt = buildImagePrompt(
    input.title || "Huozi Writer",
    Boolean(input.referenceImageDataUrl),
    undefined,
    input.authoringContext,
  );
  const size = resolveOutputSize(input.outputResolution);
  const { endpoint, requestInit, mode } = buildImageRequest({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    apiKey: engine.apiKey,
    model: engine.model,
    prompt,
    size,
    referenceImageDataUrl: input.referenceImageDataUrl,
  });
  const { response, payload, contentType, endpoint: finalEndpoint } = await fetchImageWithRetry({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    endpoint,
    requestInit,
    mode,
  });

  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveImageRequestFailureMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      endpoint,
      response,
      payload,
      model: engine.model,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  const imageUrl = extractImageUrl(payload);
  if (!imageUrl) {
    const message = resolveMissingImageFieldMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      contentType,
      payload,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  await updateGlobalCoverImageEngineHealth({
    lastCheckedAt: checkedAt,
    lastError: null,
  });

  return {
    imageUrl,
    prompt,
    size,
    model: engine.model,
    providerName: engine.providerName,
    endpoint: finalEndpoint,
  };
}

async function requestCoverImage(input: {
  title: string;
  referenceImageDataUrl?: string | null;
  variantLabel: string;
  authoringContext?: ImageAuthoringStyleContext | null;
  outputResolution?: string | null;
}) {
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
    throw new Error("请先由运营后台在后台配置全局生图 AI 引擎的 Base_URL 和 API Key");
  }

  const prompt = buildImagePrompt(
    input.title || "Huozi Writer",
    Boolean(input.referenceImageDataUrl),
    input.variantLabel,
    input.authoringContext,
  );
  const size = resolveOutputSize(input.outputResolution);
  const { endpoint, requestInit, mode } = buildImageRequest({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    apiKey: engine.apiKey,
    model: engine.model,
    prompt,
    size,
    referenceImageDataUrl: input.referenceImageDataUrl,
  });
  const { response, payload, contentType, endpoint: finalEndpoint } = await fetchImageWithRetry({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    endpoint,
    requestInit,
    mode,
  });
  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveImageRequestFailureMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      endpoint,
      response,
      payload,
      model: engine.model,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  const imageUrl = extractImageUrls(payload)[0] || extractImageUrl(payload);
  if (!imageUrl) {
    const message = resolveMissingImageFieldMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      contentType,
      payload,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  await updateGlobalCoverImageEngineHealth({
    lastCheckedAt: checkedAt,
    lastError: null,
  });

  return {
    imageUrl,
    prompt,
    size,
    model: engine.model,
    providerName: engine.providerName,
    endpoint: finalEndpoint,
  };
}

export async function generateCoverImageCandidates(input: {
  title: string;
  referenceImageDataUrl?: string | null;
  authoringContext?: ImageAuthoringStyleContext | null;
  outputResolution?: string | null;
}) {
  const variants = ["留白商业", "叙事纪实"] as const;
  const results = await Promise.all(
    variants.map((variantLabel) =>
      requestCoverImage({
        title: input.title,
        referenceImageDataUrl: input.referenceImageDataUrl,
        variantLabel,
        authoringContext: input.authoringContext,
        outputResolution: input.outputResolution,
      }).then((result) => ({
        ...result,
        variantLabel,
      })),
    ),
  );
  return results;
}
