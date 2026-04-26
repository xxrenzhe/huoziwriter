import Anthropic from "@anthropic-ai/sdk";
import { recordAiCallObservation } from "./ai-call-observations";
import { applyModelRouteEnvOverride } from "./ai-model-route-env";
import { getAnthropicBaseUrl, getAnthropicMessagesUrl, getGeminiGenerateContentUrl, getOpenAiChatCompletionsUrl, getOpenAiResponsesUrl, shouldPreferOpenAiChatCompletionsStream } from "./ai-provider-config";
import { getDatabase } from "./db";

type SupportedSceneCode =
  | "topicAnalysis"
  | "researchBrief"
  | "sourceLocalization"
  | "fragmentDistill"
  | "visionNote"
  | "articleWrite"
  | "styleExtract"
  | "topicSupplement"
  | "topicBacklogIdeation"
  | "imaHookPatternDistill"
  | "audienceProfile"
  | "outlinePlan"
  | "titleOptimizer"
  | "openingOptimizer"
  | "deepWrite"
  | "factCheck"
  | "prosePolish"
  | "languageGuardAudit"
  | "coverImageBrief"
  | "layoutExtract"
  | "publishGuard"
  | "topicFission.regularity"
  | "topicFission.contrast"
  | "topicFission.crossDomain"
  | "strategyCard.autoDraft"
  | "strategyCard.fourPointAggregate"
  | "strategyCard.strengthAudit"
  | "strategyCard.reverseWriteback"
  | "evidenceHookTagging"
  | "styleDna.crossCheck"
  | "publishGate.rhythmConsistency";
type Provider = "openai" | "anthropic" | "gemini";

type SceneRoute = {
  primaryModel: string;
  fallbackModel: string | null;
  shadowModel: string | null;
  shadowTrafficPercent: number;
};

export type RetryClassification = "retryable" | "fatal" | "fallback";

export type GatewaySystemSegment = {
  text: string;
  cacheable?: boolean;
};

export type GatewayUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
};

type ProviderCallResult = {
  text: string;
  usage?: GatewayUsage;
};

type GatewayResult = ProviderCallResult & {
  model: string;
  provider: Provider;
  attemptCount: number;
};

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export class GatewayProviderError extends Error {
  readonly provider: Provider;
  readonly model: string;
  readonly status?: number;
  readonly retryAfterMs?: number | null;

  constructor(input: {
    provider: Provider;
    model: string;
    message: string;
    status?: number;
    retryAfterMs?: number | null;
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = "GatewayProviderError";
    this.provider = input.provider;
    this.model = input.model;
    this.status = input.status;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }
}

let anthropicClient: Anthropic | null = null;
let anthropicClientApiKey: string | null = null;
let anthropicClientBaseUrl: string | null = null;

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

const OPENAI_REQUEST_TIMEOUT_MS = readPositiveIntegerEnv("OPENAI_REQUEST_TIMEOUT_MS", 300_000);

function createRequestDeadline(timeoutMs: number, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`${label} 请求超时`, "TimeoutError"));
  }, timeoutMs);
  timeout.unref?.();
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function inferProvider(model: string): Provider {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) {
    return "openai";
  }
  if (normalized.startsWith("claude")) {
    return "anthropic";
  }
  if (normalized.startsWith("gemini")) {
    return "gemini";
  }
  throw new Error(`暂不支持的模型提供方：${model}`);
}

function normalizeShadowTrafficPercent(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : 0;
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function shouldRunShadowTraffic(userId: number | null | undefined, shadowTrafficPercent: number) {
  if (typeof userId !== "number" || !Number.isFinite(userId)) {
    return false;
  }
  const normalizedPercent = normalizeShadowTrafficPercent(shadowTrafficPercent);
  if (normalizedPercent <= 0) {
    return false;
  }
  return Math.abs(userId) % 100 < normalizedPercent;
}

async function getSceneRoute(sceneCode: SupportedSceneCode): Promise<SceneRoute> {
  const db = getDatabase();
  const candidateSceneCodes = [sceneCode];
  let route: {
    primary_model: string;
    fallback_model: string | null;
    shadow_model: string | null;
    shadow_traffic_percent: number | null;
  } | null = null;
  for (const candidateSceneCode of candidateSceneCodes) {
    const foundRoute = await db.queryOne<{
      primary_model: string;
      fallback_model: string | null;
      shadow_model: string | null;
      shadow_traffic_percent: number | null;
    }>(
      "SELECT primary_model, fallback_model, shadow_model, shadow_traffic_percent FROM ai_model_routes WHERE scene_code = ?",
      [candidateSceneCode],
    );
    if (foundRoute) {
      route = foundRoute;
      break;
    }
  }
  if (!route) {
    throw new Error(`未找到场景模型路由：${sceneCode}`);
  }
  return applyModelRouteEnvOverride(sceneCode, {
    primaryModel: route.primary_model,
    fallbackModel: route.fallback_model,
    shadowModel: route.shadow_model,
    shadowTrafficPercent: normalizeShadowTrafficPercent(route.shadow_traffic_percent),
  });
}

function extractOpenAIText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const chunks = Array.isArray(payload?.output) ? payload.output : [];
  const texts = chunks.flatMap((item: any) =>
    Array.isArray(item?.content)
      ? item.content
          .map((part: any) => part?.text)
          .filter((text: unknown) => typeof text === "string" && text.trim())
      : [],
  );
  const merged = texts.join("\n").trim();
  if (!merged) {
    throw new Error("OpenAI 未返回文本内容");
  }
  return merged;
}

function extractOpenAiChatCompletionText(payload: any) {
  const text = Array.isArray(payload?.choices)
    ? payload.choices
        .flatMap((choice: any) => {
          const content = choice?.message?.content;
          if (typeof content === "string") {
            return [content];
          }
          if (Array.isArray(content)) {
            return content
              .map((part: any) => part?.text)
              .filter((value: unknown) => typeof value === "string" && value.trim());
          }
          return [];
        })
        .join("\n")
        .trim()
    : "";
  if (!text) {
    throw new Error("OpenAI chat.completions 未返回文本内容");
  }
  return text;
}

function summarizeOpenAiPayload(payload: any) {
  if (!payload || typeof payload !== "object") {
    return "响应不是 JSON 对象";
  }
  const status = typeof payload.status === "string" ? payload.status : null;
  const outputLength = Array.isArray(payload.output) ? payload.output.length : null;
  const choiceLength = Array.isArray(payload.choices) ? payload.choices.length : null;
  const parts = [
    status ? `status=${status}` : null,
    outputLength != null ? `output=${outputLength}` : null,
    choiceLength != null ? `choices=${choiceLength}` : null,
  ].filter(Boolean);
  return parts.join(", ") || "缺少可识别字段";
}

async function extractOpenAiChatCompletionStreamText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("OpenAI chat.completions 流式响应缺少 body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const parts: string[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }
      const payload = JSON.parse(data);
      const delta = payload?.choices?.[0]?.delta;
      if (typeof delta?.content === "string") {
        parts.push(delta.content);
      }
    }
  }
  const trailing = buffer.trim();
  if (trailing.startsWith("data:")) {
    const data = trailing.slice(5).trim();
    if (data && data !== "[DONE]") {
      const payload = JSON.parse(data);
      const delta = payload?.choices?.[0]?.delta;
      if (typeof delta?.content === "string") {
        parts.push(delta.content);
      }
    }
  }
  const text = parts.join("").trim();
  if (!text) {
    throw new Error("OpenAI chat.completions 流式响应未返回文本内容");
  }
  return text;
}

async function callOpenAiChatCompletionStream(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestTimeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
): Promise<ProviderCallResult> {
  const deadline = createRequestDeadline(requestTimeoutMs, "OpenAI stream chat.completions");
  try {
    const streamResponse = await fetch(getOpenAiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        stream: true,
      }),
      signal: deadline.signal,
    });
    if (!streamResponse.ok) {
      const streamPayload = await streamResponse.json().catch(() => null);
      throw createProviderError({
        provider: "openai",
        model,
        status: streamResponse.status,
        retryAfterMs: parseRetryAfterMs(streamResponse.headers.get("retry-after")),
        message: streamPayload?.error?.message || `OpenAI stream chat.completions 请求失败，HTTP ${streamResponse.status}`,
      });
    }
    return {
      text: await extractOpenAiChatCompletionStreamText(streamResponse),
      usage: undefined,
    };
  } finally {
    deadline.clear();
  }
}

function normalizeUsageNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildUsage(input: Partial<GatewayUsage> | null | undefined) {
  if (!input) {
    return undefined;
  }
  const usage = {
    inputTokens: normalizeUsageNumber(input.inputTokens),
    outputTokens: normalizeUsageNumber(input.outputTokens),
    totalTokens: normalizeUsageNumber(input.totalTokens),
    cacheCreationInputTokens: normalizeUsageNumber(input.cacheCreationInputTokens),
    cacheReadInputTokens: normalizeUsageNumber(input.cacheReadInputTokens),
  } satisfies GatewayUsage;
  return Object.values(usage).some((value) => value != null) ? usage : undefined;
}

function parseRetryAfterMs(value: string | null | undefined, now = Date.now()) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const absolute = Date.parse(normalized);
  if (Number.isNaN(absolute)) {
    return null;
  }
  return Math.max(0, absolute - now);
}

function getErrorStatus(error: unknown) {
  if (error instanceof GatewayProviderError && typeof error.status === "number") {
    return error.status;
  }
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function getRetryAfterFromError(error: unknown) {
  if (error instanceof GatewayProviderError) {
    return error.retryAfterMs ?? null;
  }
  const retryAfterMs = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) ? retryAfterMs : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function getGatewayObservationErrorClass(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 429) {
    return "429";
  }
  if (typeof status === "number" && status >= 500) {
    return "5xx";
  }
  if (status === 401 || status === 403) {
    return "fatal";
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "timeout";
  }
  if (error instanceof Error && (/timeout/i.test(error.name) || /timed out|timeout/i.test(error.message))) {
    return "timeout";
  }
  return classifyGatewayError(error, status);
}

function createProviderError(input: {
  provider: Provider;
  model: string;
  message: string;
  status?: number;
  retryAfterMs?: number | null;
  cause?: unknown;
}) {
  return new GatewayProviderError(input);
}

function getAnthropicClient(apiKey: string) {
  const baseURL = getAnthropicBaseUrl();
  if (!anthropicClient || anthropicClientApiKey !== apiKey || anthropicClientBaseUrl !== baseURL) {
    anthropicClient = new Anthropic({
      apiKey,
      baseURL,
      timeout: 90_000,
    });
    anthropicClientApiKey = apiKey;
    anthropicClientBaseUrl = baseURL;
  }
  return anthropicClient;
}

async function callOpenAI(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestTimeoutMs = OPENAI_REQUEST_TIMEOUT_MS,
): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY");
  }
  if (shouldPreferOpenAiChatCompletionsStream()) {
    return callOpenAiChatCompletionStream(model, apiKey, systemPrompt, userPrompt, temperature, requestTimeoutMs);
  }
  const responseDeadline = createRequestDeadline(requestTimeoutMs, "OpenAI responses");
  let response: Response;
  let payload: any;
  try {
    response = await fetch(getOpenAiResponsesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        temperature,
      }),
      signal: responseDeadline.signal,
    });
    payload = await response.json().catch(() => null);
  } finally {
    responseDeadline.clear();
  }
  if (!response.ok) {
    throw createProviderError({
      provider: "openai",
      model,
      status: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      message: payload?.error?.message || `OpenAI 请求失败，HTTP ${response.status}`,
    });
  }
  try {
    return {
      text: extractOpenAIText(payload),
      usage: buildUsage({
        inputTokens: payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens,
        outputTokens: payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens,
        totalTokens: payload?.usage?.total_tokens,
      }),
    };
  } catch (responsesError) {
    const chatDeadline = createRequestDeadline(requestTimeoutMs, "OpenAI chat.completions");
    let chatResponse: Response;
    let chatPayload: any;
    try {
      chatResponse = await fetch(getOpenAiChatCompletionsUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
        }),
        signal: chatDeadline.signal,
      });
      chatPayload = await chatResponse.json().catch(() => null);
    } finally {
      chatDeadline.clear();
    }
    if (!chatResponse.ok) {
      throw createProviderError({
        provider: "openai",
        model,
        status: chatResponse.status,
        retryAfterMs: parseRetryAfterMs(chatResponse.headers.get("retry-after")),
        message: chatPayload?.error?.message || `OpenAI chat.completions 请求失败，HTTP ${chatResponse.status}`,
        cause: responsesError,
      });
    }
    try {
      return {
        text: extractOpenAiChatCompletionText(chatPayload),
        usage: buildUsage({
          inputTokens: chatPayload?.usage?.prompt_tokens ?? chatPayload?.usage?.input_tokens,
          outputTokens: chatPayload?.usage?.completion_tokens ?? chatPayload?.usage?.output_tokens,
          totalTokens: chatPayload?.usage?.total_tokens,
        }),
      };
    } catch (chatError) {
      try {
        return await callOpenAiChatCompletionStream(model, apiKey, systemPrompt, userPrompt, temperature, requestTimeoutMs);
      } catch (streamError) {
        throw createProviderError({
          provider: "openai",
          model,
          message: `OpenAI 文本响应为空：responses(${summarizeOpenAiPayload(payload)})；chat.completions(${summarizeOpenAiPayload(chatPayload)})；stream(chat.completions) 无正文`,
          cause: streamError,
        });
      }
    }
  }
}

function extractAnthropicText(payload: any) {
  const text = Array.isArray(payload?.content)
    ? payload.content
        .map((item: any) => item?.text)
        .filter((value: unknown) => typeof value === "string" && value.trim())
        .join("\n")
        .trim()
    : "";
  if (!text) {
    throw new Error("Anthropic 未返回文本内容");
  }
  return text;
}

async function callAnthropicWithFetch(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestTimeoutMs = 90_000,
): Promise<ProviderCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY");
  }
  const deadline = createRequestDeadline(requestTimeoutMs, "Anthropic messages");
  let response: Response;
  let payload: any;
  try {
    response = await fetch(getAnthropicMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 4096,
        temperature,
      }),
      signal: deadline.signal,
    });
    payload = await response.json().catch(() => null);
  } finally {
    deadline.clear();
  }
  if (!response.ok) {
    throw createProviderError({
      provider: "anthropic",
      model,
      status: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      message: payload?.error?.message || `Anthropic 请求失败，HTTP ${response.status}`,
    });
  }
  return {
    text: extractAnthropicText(payload),
    usage: buildUsage({
      inputTokens: payload?.usage?.input_tokens,
      outputTokens: payload?.usage?.output_tokens,
      cacheCreationInputTokens: payload?.usage?.cache_creation_input_tokens,
      cacheReadInputTokens: payload?.usage?.cache_read_input_tokens,
      totalTokens:
        (normalizeUsageNumber(payload?.usage?.input_tokens) ?? 0) +
        (normalizeUsageNumber(payload?.usage?.cache_creation_input_tokens) ?? 0) +
        (normalizeUsageNumber(payload?.usage?.cache_read_input_tokens) ?? 0) +
        (normalizeUsageNumber(payload?.usage?.output_tokens) ?? 0),
    }),
  };
}

async function callAnthropic(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  systemSegments?: GatewaySystemSegment[],
  requestTimeoutMs = 90_000,
): Promise<ProviderCallResult> {
  if (!systemSegments || systemSegments.length === 0) {
    return callAnthropicWithFetch(model, systemPrompt, userPrompt, temperature, requestTimeoutMs);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY");
  }
  try {
    const response = await getAnthropicClient(apiKey).messages.create({
      model,
      max_tokens: 4096,
      temperature,
      system: systemSegments.map((segment) => ({
        type: "text",
        text: segment.text,
        cache_control: segment.cacheable ? { type: "ephemeral" } : undefined,
      })),
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      .map((item) => ("text" in item && typeof item.text === "string" ? item.text : ""))
      .filter((value) => value.trim())
      .join("\n")
      .trim();
    if (!text) {
      throw new Error("Anthropic 未返回文本内容");
    }
    return {
      text,
      usage: buildUsage({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens,
        totalTokens:
          response.usage.input_tokens +
          response.usage.output_tokens +
          (response.usage.cache_creation_input_tokens ?? 0) +
          (response.usage.cache_read_input_tokens ?? 0),
      }),
    };
  } catch (error) {
    if (error instanceof GatewayProviderError) {
      throw error;
    }
    throw createProviderError({
      provider: "anthropic",
      model,
      status: getErrorStatus(error),
      retryAfterMs: parseRetryAfterMs((error as { headers?: Headers } | null)?.headers?.get("retry-after")),
      message: getErrorMessage(error),
      cause: error,
    });
  }
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  requestTimeoutMs = 90_000,
): Promise<ProviderCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY");
  }
  const deadline = createRequestDeadline(requestTimeoutMs, "Gemini generateContent");
  let response: Response;
  let payload: any;
  try {
    response = await fetch(
      getGeminiGenerateContentUrl(model, apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature,
          },
        }),
        signal: deadline.signal,
      },
    );
    payload = await response.json().catch(() => null);
  } finally {
    deadline.clear();
  }
  if (!response.ok) {
    throw createProviderError({
      provider: "gemini",
      model,
      status: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      message: payload?.error?.message || `Gemini 请求失败，HTTP ${response.status}`,
    });
  }
  const text = Array.isArray(payload?.candidates)
    ? payload.candidates
        .flatMap((candidate: any) => candidate?.content?.parts || [])
        .map((part: any) => part?.text)
        .filter((value: unknown) => typeof value === "string" && value.trim())
        .join("\n")
        .trim()
    : "";
  if (!text) {
    throw new Error("Gemini 未返回文本内容");
  }
  return {
    text,
    usage: buildUsage({
      inputTokens: payload?.usageMetadata?.promptTokenCount,
      outputTokens: payload?.usageMetadata?.candidatesTokenCount,
      totalTokens: payload?.usageMetadata?.totalTokenCount,
    }),
  };
}

async function callProvider(
  provider: Provider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  systemSegments?: GatewaySystemSegment[],
  requestTimeoutMs?: number,
) {
  if (provider === "openai") {
    return callOpenAI(model, systemPrompt, userPrompt, temperature, requestTimeoutMs);
  }
  if (provider === "anthropic") {
    return callAnthropic(model, systemPrompt, userPrompt, temperature, systemSegments, requestTimeoutMs);
  }
  return callGemini(model, systemPrompt, userPrompt, temperature, requestTimeoutMs);
}

export function classifyGatewayError(error: unknown, status = getErrorStatus(error)): RetryClassification {
  if (status === 429) {
    return "retryable";
  }
  if (typeof status === "number" && status >= 500) {
    return "retryable";
  }
  if (status === 401 || status === 403) {
    return "fatal";
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "retryable";
  }
  if (error instanceof Error && /timeout/i.test(error.name)) {
    return "retryable";
  }
  if (error instanceof Error && /timed out|timeout/i.test(error.message)) {
    return "retryable";
  }
  return "fallback";
}

export function getRetryDelayMs(attempt: number, error: unknown, baseDelayMs = 200) {
  const retryAfterMs = getRetryAfterFromError(error);
  if (retryAfterMs != null && retryAfterMs >= 0) {
    return retryAfterMs;
  }
  const backoffSchedule = [
    baseDelayMs,
    Math.max(1_500, Math.round(baseDelayMs * 7.5)),
    8_000,
  ];
  return backoffSchedule[Math.max(0, Math.min(attempt - 1, backoffSchedule.length - 1))] ?? 8_000;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function executeWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions) {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const baseDelayMs = options?.baseDelayMs ?? 200;
  const wait = options?.sleep ?? sleep;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return {
        value: await fn(),
        attemptCount: attempt,
      };
    } catch (error) {
      const classification = classifyGatewayError(error);
      if (classification === "fatal" || classification === "fallback" || attempt >= maxAttempts) {
        throw error;
      }
      await wait(getRetryDelayMs(attempt, error, baseDelayMs));
    }
  }

  throw new Error("unreachable");
}

function buildResolvedSystemPrompt(systemPrompt: string, systemSegments?: GatewaySystemSegment[]) {
  if (!systemSegments || systemSegments.length === 0) {
    return systemPrompt;
  }
  return systemSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function findBalancedJsonSlice(text: string, startIndex: number) {
  const openingChar = text[startIndex];
  if (openingChar !== "{" && openingChar !== "[") {
    return null;
  }
  const expectedClosingChar = openingChar === "{" ? "}" : "]";
  const stack: string[] = [expectedClosingChar];
  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (stack.length === 0 || stack[stack.length - 1] !== char) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function collectJsonCandidates(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const sources = [fenced, trimmed].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const candidates: string[] = [];

  for (const source of sources) {
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char !== "{" && char !== "[") {
        continue;
      }
      const slice = findBalancedJsonSlice(source, index);
      if (slice && !candidates.includes(slice)) {
        candidates.push(slice);
      }
    }

    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = source.slice(firstBrace, lastBrace + 1);
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    const firstBracket = source.indexOf("[");
    const lastBracket = source.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const candidate = source.slice(firstBracket, lastBracket + 1);
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function sanitizeJsonCandidate(candidate: string) {
  const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, "$1");
  let sanitized = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < withoutTrailingCommas.length; index += 1) {
    const char = withoutTrailingCommas[index];
    if (inString) {
      if (escaped) {
        sanitized += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        sanitized += char;
        escaped = true;
        continue;
      }
      if (char === "\"") {
        sanitized += char;
        inString = false;
        continue;
      }
      if (char === "\n") {
        sanitized += "\\n";
        continue;
      }
      if (char === "\r") {
        sanitized += "\\r";
        continue;
      }
      if (char === "\t") {
        sanitized += "\\t";
        continue;
      }
      sanitized += char;
      continue;
    }

    if (char === "\"") {
      inString = true;
    }
    sanitized += char;
  }

  return sanitized;
}

export function extractJsonObject(text: string) {
  const candidates = collectJsonCandidates(text);
  if (candidates.length === 0) {
    throw new Error("模型返回中未找到 JSON 对象");
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    for (const variant of [candidate, sanitizeJsonCandidate(candidate)]) {
      try {
        return JSON.parse(variant);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("模型返回 JSON 解析失败");
}

export async function generateSceneText(input: {
  sceneCode: SupportedSceneCode;
  systemPrompt: string;
  userPrompt: string;
  systemSegments?: GatewaySystemSegment[];
  observationMeta?: {
    articleId?: number | null;
  };
  temperature?: number;
  rolloutUserId?: number | null;
  maxAttempts?: number;
  requestTimeoutMs?: number;
}) {
  const startedAt = Date.now();
  const route = await getSceneRoute(input.sceneCode);
  const models = [route.primaryModel, route.fallbackModel].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
  const errors: string[] = [];
  const systemPrompt = buildResolvedSystemPrompt(input.systemPrompt, input.systemSegments);
  let lastFailedModel: string | null = null;
  let lastFailedProvider: Provider | null = null;
  let lastFailedError: unknown = null;

  for (const model of models) {
    const provider = inferProvider(model);
    try {
      const result = await executeWithRetry(
        () =>
          callProvider(
            provider,
            model,
            systemPrompt,
                  input.userPrompt,
                  input.temperature ?? 0.3,
                  provider === "anthropic" ? input.systemSegments : undefined,
                  input.requestTimeoutMs,
                ),
        { maxAttempts: input.maxAttempts ?? 3, baseDelayMs: 200 },
      );
      void recordAiCallObservation({
        sceneCode: input.sceneCode,
        articleId: input.observationMeta?.articleId ?? null,
        model,
        provider,
        callMode: model === route.primaryModel ? "primary" : "fallback",
        inputTokens: result.value.usage?.inputTokens ?? null,
        outputTokens: result.value.usage?.outputTokens ?? null,
        cacheCreationTokens: result.value.usage?.cacheCreationInputTokens ?? null,
        cacheReadTokens: result.value.usage?.cacheReadInputTokens ?? null,
        latencyMs: Date.now() - startedAt,
        status: errors.length > 0 || result.attemptCount > 1 ? "retried" : "success",
        errorClass: null,
      }).catch(() => undefined);
      if (
        route.shadowModel
        && route.shadowModel !== model
        && shouldRunShadowTraffic(input.rolloutUserId, route.shadowTrafficPercent)
      ) {
        const shadowModel = route.shadowModel;
        const shadowProvider = inferProvider(shadowModel);
        void (async () => {
          const shadowStartedAt = Date.now();
          try {
            const shadowResult = await executeWithRetry(
              () =>
                callProvider(
                  shadowProvider,
                  shadowModel,
                  systemPrompt,
                  input.userPrompt,
                  input.temperature ?? 0.3,
                  shadowProvider === "anthropic" ? input.systemSegments : undefined,
                  input.requestTimeoutMs,
                ),
              { maxAttempts: input.maxAttempts ?? 3, baseDelayMs: 200 },
            );
            await recordAiCallObservation({
              sceneCode: input.sceneCode,
              articleId: input.observationMeta?.articleId ?? null,
              model: shadowModel,
              provider: shadowProvider,
              callMode: "shadow",
              inputTokens: shadowResult.value.usage?.inputTokens ?? null,
              outputTokens: shadowResult.value.usage?.outputTokens ?? null,
              cacheCreationTokens: shadowResult.value.usage?.cacheCreationInputTokens ?? null,
              cacheReadTokens: shadowResult.value.usage?.cacheReadInputTokens ?? null,
              latencyMs: Date.now() - shadowStartedAt,
              status: shadowResult.attemptCount > 1 ? "retried" : "success",
              errorClass: null,
            });
          } catch (error) {
            await recordAiCallObservation({
              sceneCode: input.sceneCode,
              articleId: input.observationMeta?.articleId ?? null,
              model: shadowModel,
              provider: shadowProvider,
              callMode: "shadow",
              latencyMs: Date.now() - shadowStartedAt,
              status: "failed",
              errorClass: getGatewayObservationErrorClass(error),
            });
          }
        })().catch(() => undefined);
      }
      return {
        ...result.value,
        model,
        provider,
        attemptCount: result.attemptCount,
      } satisfies GatewayResult;
    } catch (error) {
      lastFailedModel = model;
      lastFailedProvider = provider;
      lastFailedError = error;
      errors.push(`${model}: ${getErrorMessage(error)}`);
      if (classifyGatewayError(error) === "fatal") {
        void recordAiCallObservation({
          sceneCode: input.sceneCode,
          articleId: input.observationMeta?.articleId ?? null,
          model,
          provider,
          callMode: model === route.primaryModel ? "primary" : "fallback",
          latencyMs: Date.now() - startedAt,
          status: "failed",
          errorClass: getGatewayObservationErrorClass(error),
        }).catch(() => undefined);
        throw new Error(`${input.sceneCode} 调用失败：${errors.join(" | ")}`);
      }
    }
  }

  if (lastFailedModel && lastFailedProvider) {
    void recordAiCallObservation({
      sceneCode: input.sceneCode,
      articleId: input.observationMeta?.articleId ?? null,
      model: lastFailedModel,
      provider: lastFailedProvider,
      callMode: lastFailedModel === route.primaryModel ? "primary" : "fallback",
      latencyMs: Date.now() - startedAt,
      status: "failed",
      errorClass: getGatewayObservationErrorClass(lastFailedError),
    }).catch(() => undefined);
  }
  throw new Error(`${input.sceneCode} 调用失败：${errors.join(" | ")}`);
}
