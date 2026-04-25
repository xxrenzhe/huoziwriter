import { getGlobalCoverImageEngineSecret, updateGlobalCoverImageEngineHealth } from "./image-engine";
import { buildVisualAuthoringDirective, type ImageAuthoringStyleContext } from "./image-authoring-context";

type ImageProvider = "openai" | "custom";
type ImageRequestMode = "generations" | "edits";

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
  if (resolveImageProvider(input) === "openai") {
    return buildOpenAiImageRequest(input);
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
  return base64Candidates.map((item) => `data:image/png;base64,${item}`);
}

function resolveErrorMessage(payload: any, fallbackText: string) {
  if (payload?.error?.message) return String(payload.error.message);
  if (payload?.message) return String(payload.message);
  return fallbackText;
}

function resolveImageRequestFailureMessage(input: {
  providerName?: string | null;
  baseUrl: string;
  endpoint: string;
  response: Response;
  payload: any;
}) {
  if (
    resolveImageProvider(input) === "openai"
    && !isOfficialOpenAiBaseUrl(input.baseUrl)
    && input.endpoint.includes("/images/")
    && input.response.status === 404
  ) {
    return buildUnsupportedOpenAiImageEndpointMessage(input.baseUrl);
  }
  return resolveErrorMessage(input.payload, `生图引擎请求失败，HTTP ${input.response.status}`);
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

function shouldRetryOpenAiImageRequest(input: {
  providerName?: string | null;
  baseUrl: string;
  endpoint: string;
  retryEndpoint: string | null;
  response: Response;
  contentType: string;
  payload: any;
}) {
  if (resolveImageProvider(input) !== "openai" || !input.retryEndpoint || input.endpoint === input.retryEndpoint) {
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
    return first;
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
  const { endpoint, requestInit } = buildImageRequest({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    apiKey: engine.apiKey,
    model: engine.model,
    prompt,
    size,
    referenceImageDataUrl: input.referenceImageDataUrl,
  });
  const { response, payload } = await fetchImageWithRetry({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    endpoint,
    requestInit,
    mode: input.referenceImageDataUrl ? "edits" : "generations",
  });

  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveImageRequestFailureMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      endpoint,
      response,
      payload,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  const imageUrl = extractImageUrl(payload);
  if (!imageUrl) {
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: "生图引擎返回成功，但未发现图片结果字段",
    });
    throw new Error("生图引擎返回成功，但未发现图片结果字段");
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
    endpoint,
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
  const { endpoint, requestInit } = buildImageRequest({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    apiKey: engine.apiKey,
    model: engine.model,
    prompt,
    size,
    referenceImageDataUrl: input.referenceImageDataUrl,
  });
  const { response, payload } = await fetchImageWithRetry({
    providerName: engine.providerName,
    baseUrl: engine.baseUrl,
    endpoint,
    requestInit,
    mode: input.referenceImageDataUrl ? "edits" : "generations",
  });
  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveImageRequestFailureMessage({
      providerName: engine.providerName,
      baseUrl: engine.baseUrl,
      endpoint,
      response,
      payload,
    });
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: message,
    });
    throw new Error(message);
  }

  const imageUrl = extractImageUrls(payload)[0] || extractImageUrl(payload);
  if (!imageUrl) {
    await updateGlobalCoverImageEngineHealth({
      lastCheckedAt: checkedAt,
      lastError: "生图引擎返回成功，但未发现图片结果字段",
    });
    throw new Error("生图引擎返回成功，但未发现图片结果字段");
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
    endpoint,
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
