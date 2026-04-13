import { getGlobalCoverImageEngineSecret, updateGlobalCoverImageEngineHealth } from "./image-engine";

function buildImagePrompt(title: string, hasReferenceImage: boolean) {
  return `为一篇中文内容产品封面生成 16:9 图片。标题：${title}。要求：克制、新中式、留白、适合商业与写作类文章封面，不出现水印，不要密集文字，只保留高辨识度主体。${
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
    payload?.images?.[0]?.url,
    payload?.output?.[0]?.url,
    payload?.imageUrl,
  ];
  const url = candidates.find((item) => typeof item === "string" && item.length > 0);
  if (url) {
    return url;
  }

  const base64Candidates = [
    payload?.data?.[0]?.b64_json,
    payload?.images?.[0]?.b64_json,
    payload?.output?.[0]?.b64_json,
    payload?.b64_json,
  ];
  const b64 = base64Candidates.find((item) => typeof item === "string" && item.length > 0);
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }

  return null;
}

function resolveErrorMessage(payload: any, fallbackText: string) {
  if (payload?.error?.message) return String(payload.error.message);
  if (payload?.message) return String(payload.message);
  return fallbackText;
}

export async function generateCoverImage(input: {
  title: string;
  referenceImageDataUrl?: string | null;
}) {
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
    throw new Error("请先由管理员在后台配置全局生图 AI 引擎的 Base_URL 和 API Key");
  }

  const prompt = buildImagePrompt(input.title || "Huozi Writer", Boolean(input.referenceImageDataUrl));
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
