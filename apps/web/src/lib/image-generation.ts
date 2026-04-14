import { getGlobalCoverImageEngineSecret, updateGlobalCoverImageEngineHealth } from "./image-engine";
import { buildVisualAuthoringDirective, type ImageAuthoringStyleContext } from "./image-authoring-context";

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

function resolveImageGenerationEndpoint(baseUrl: string) {
  if (baseUrl.endsWith("/images/generations")) {
    return baseUrl;
  }
  return `${baseUrl}/images/generations`;
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

export async function generateCoverImage(input: {
  title: string;
  referenceImageDataUrl?: string | null;
  authoringContext?: ImageAuthoringStyleContext | null;
}) {
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
    throw new Error("请先由管理员在后台配置全局生图 AI 引擎的 Base_URL 和 API Key");
  }

  const prompt = buildImagePrompt(
    input.title || "Huozi Writer",
    Boolean(input.referenceImageDataUrl),
    undefined,
    input.authoringContext,
  );
  const endpoint = resolveImageGenerationEndpoint(engine.baseUrl);
  const requestPayload: Record<string, unknown> = {
    model: engine.model,
    prompt,
    size: "1536x1024",
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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${engine.apiKey}`,
    },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(60_000),
  });

  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = { raw: responseText };
  }

  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveErrorMessage(payload, `生图引擎请求失败，HTTP ${response.status}`);
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
}) {
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
    throw new Error("请先由管理员在后台配置全局生图 AI 引擎的 Base_URL 和 API Key");
  }

  const prompt = buildImagePrompt(
    input.title || "Huozi Writer",
    Boolean(input.referenceImageDataUrl),
    input.variantLabel,
    input.authoringContext,
  );
  const endpoint = resolveImageGenerationEndpoint(engine.baseUrl);
  const requestPayload: Record<string, unknown> = {
    model: engine.model,
    prompt,
    size: "1536x1024",
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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${engine.apiKey}`,
    },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(60_000),
  });

  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = { raw: responseText };
  }
  const checkedAt = new Date().toISOString();
  if (!response.ok) {
    const message = resolveErrorMessage(payload, `生图引擎请求失败，HTTP ${response.status}`);
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
    model: engine.model,
    providerName: engine.providerName,
    endpoint,
  };
}

export async function generateCoverImageCandidates(input: {
  title: string;
  referenceImageDataUrl?: string | null;
  authoringContext?: ImageAuthoringStyleContext | null;
}) {
  const variants = ["留白商业", "叙事纪实"] as const;
  const results = await Promise.all(
    variants.map((variantLabel) =>
      requestCoverImage({
        title: input.title,
        referenceImageDataUrl: input.referenceImageDataUrl,
        variantLabel,
        authoringContext: input.authoringContext,
      }).then((result) => ({
        ...result,
        variantLabel,
      })),
    ),
  );
  return results;
}
