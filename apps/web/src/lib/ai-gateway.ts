import Anthropic from "@anthropic-ai/sdk";
import { recordAiCallObservation } from "./ai-call-observations";
import { getDatabase } from "./db";

type SupportedSceneCode =
  | "researchBrief"
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
  return {
    primaryModel: route.primary_model,
    fallbackModel: route.fallback_model,
    shadowModel: route.shadow_model,
    shadowTrafficPercent: normalizeShadowTrafficPercent(route.shadow_traffic_percent),
  };
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
  if (!anthropicClient || anthropicClientApiKey !== apiKey) {
    anthropicClient = new Anthropic({
      apiKey,
      timeout: 90_000,
    });
    anthropicClientApiKey = apiKey;
  }
  return anthropicClient;
}

async function callOpenAI(model: string, systemPrompt: string, userPrompt: string, temperature: number): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY");
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
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
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw createProviderError({
      provider: "openai",
      model,
      status: response.status,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      message: payload?.error?.message || `OpenAI 请求失败，HTTP ${response.status}`,
    });
  }
  return {
    text: extractOpenAIText(payload),
    usage: buildUsage({
      inputTokens: payload?.usage?.input_tokens ?? payload?.usage?.prompt_tokens,
      outputTokens: payload?.usage?.output_tokens ?? payload?.usage?.completion_tokens,
      totalTokens: payload?.usage?.total_tokens,
    }),
  };
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

async function callAnthropicWithFetch(model: string, systemPrompt: string, userPrompt: string, temperature: number): Promise<ProviderCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 ANTHROPIC_API_KEY");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => null);
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
): Promise<ProviderCallResult> {
  if (!systemSegments || systemSegments.length === 0) {
    return callAnthropicWithFetch(model, systemPrompt, userPrompt, temperature);
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

async function callGemini(model: string, systemPrompt: string, userPrompt: string, temperature: number): Promise<ProviderCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
      signal: AbortSignal.timeout(90_000),
    },
  );
  const payload = await response.json().catch(() => null);
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
) {
  if (provider === "openai") {
    return callOpenAI(model, systemPrompt, userPrompt, temperature);
  }
  if (provider === "anthropic") {
    return callAnthropic(model, systemPrompt, userPrompt, temperature, systemSegments);
  }
  return callGemini(model, systemPrompt, userPrompt, temperature);
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

export function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("模型返回中未找到 JSON 对象");
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

export async function generateSceneText(input: {
  sceneCode: SupportedSceneCode;
  systemPrompt: string;
  userPrompt: string;
  systemSegments?: GatewaySystemSegment[];
  temperature?: number;
  rolloutUserId?: number | null;
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
          ),
        { maxAttempts: 3, baseDelayMs: 200 },
      );
      void recordAiCallObservation({
        sceneCode: input.sceneCode,
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
                ),
              { maxAttempts: 3, baseDelayMs: 200 },
            );
            await recordAiCallObservation({
              sceneCode: input.sceneCode,
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
