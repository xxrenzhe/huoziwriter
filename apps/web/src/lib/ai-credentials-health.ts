import { getModelRoutes } from "./repositories";
import { getAnthropicMessagesUrl, getGeminiGenerateContentUrl, getOpenAiResponsesUrl } from "./ai-provider-config";

export type AiCredentialProvider = "openai" | "anthropic" | "gemini";
export type AiCredentialHealthStatus = "healthy" | "missing_env" | "probe_failed" | "unused";

export type AiCredentialProviderHealth = {
  provider: AiCredentialProvider;
  status: AiCredentialHealthStatus;
  envConfigured: boolean;
  envKeyLabel: string;
  probeModel: string | null;
  models: string[];
  sceneCodes: string[];
  lastProbeAt: string | null;
  statusCode: number | null;
  error: string | null;
  latencyMs: number | null;
};

export type AiCredentialHealthMatrix = {
  generatedAt: string;
  ttlSeconds: number;
  providers: AiCredentialProviderHealth[];
};

type RouteScope = {
  models: string[];
  sceneCodes: string[];
};

type ProbeResult = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: AiCredentialHealthMatrix;
};

const PROVIDERS: AiCredentialProvider[] = ["openai", "anthropic", "gemini"];
const CACHE_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 15_000;

let cacheEntry: CacheEntry | null = null;
let inFlightMatrixPromise: Promise<AiCredentialHealthMatrix> | null = null;

function inferProvider(model: string): AiCredentialProvider | null {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) {
    return "openai";
  }
  if (normalized.startsWith("claude")) {
    return "anthropic";
  }
  if (normalized.startsWith("gemini")) {
    return "gemini";
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function getProviderCredential(provider: AiCredentialProvider) {
  if (provider === "openai") {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    return {
      apiKey: apiKey || null,
      envConfigured: Boolean(apiKey),
      envKeyLabel: "OPENAI_API_KEY",
    };
  }
  if (provider === "anthropic") {
    const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
    return {
      apiKey: apiKey || null,
      envConfigured: Boolean(apiKey),
      envKeyLabel: "ANTHROPIC_API_KEY",
    };
  }
  const geminiApiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const googleApiKey = String(process.env.GOOGLE_API_KEY || "").trim();
  return {
    apiKey: geminiApiKey || googleApiKey || null,
    envConfigured: Boolean(geminiApiKey || googleApiKey),
    envKeyLabel: "GEMINI_API_KEY / GOOGLE_API_KEY",
  };
}

function extractErrorMessage(payload: any, fallback: string) {
  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message.trim();
  }
  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return fallback;
}

async function parseJsonResponse(response: Response) {
  return response.json().catch(() => null);
}

async function probeOpenAI(model: string, apiKey: string): Promise<ProbeResult> {
  const response = await fetch(getOpenAiResponsesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: "health-check",
      max_output_tokens: 1,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      error: extractErrorMessage(payload, `OpenAI probe failed with HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    statusCode: response.status,
    error: null,
  };
}

async function sendAnthropicProbe(model: string, apiKey: string, useCacheControl: boolean): Promise<ProbeResult> {
  const response = await fetch(getAnthropicMessagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(useCacheControl ? { "anthropic-beta": "prompt-caching-2024-07-31" } : {}),
    },
    body: JSON.stringify({
      model,
      system: useCacheControl
        ? [{ type: "text", text: "health probe", cache_control: { type: "ephemeral" } }]
        : "health probe",
      messages: [{ role: "user", content: [{ type: "text", text: "ok" }] }],
      max_tokens: 1,
      temperature: 0,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const payload = await parseJsonResponse(response);
  if (response.ok) {
    return {
      ok: true,
      statusCode: response.status,
      error: null,
    };
  }

  const error = extractErrorMessage(payload, `Anthropic probe failed with HTTP ${response.status}`);
  if (useCacheControl && response.status === 400 && /cache_control|prompt cach/i.test(error)) {
    return sendAnthropicProbe(model, apiKey, false);
  }

  return {
    ok: false,
    statusCode: response.status,
    error,
  };
}

async function probeAnthropic(model: string, apiKey: string) {
  return sendAnthropicProbe(model, apiKey, true);
}

async function probeGemini(model: string, apiKey: string): Promise<ProbeResult> {
  const response = await fetch(
    getGeminiGenerateContentUrl(model, apiKey),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "health-check" }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    },
  );
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      error: extractErrorMessage(payload, `Gemini probe failed with HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    statusCode: response.status,
    error: null,
  };
}

async function probeProvider(provider: AiCredentialProvider, model: string, apiKey: string): Promise<ProbeResult> {
  if (provider === "openai") {
    return probeOpenAI(model, apiKey);
  }
  if (provider === "anthropic") {
    return probeAnthropic(model, apiKey);
  }
  return probeGemini(model, apiKey);
}

async function loadHealthMatrix(): Promise<AiCredentialHealthMatrix> {
  const routes = await getModelRoutes();
  const routeScopeMap = new Map<AiCredentialProvider, RouteScope>(
    PROVIDERS.map((provider) => [provider, { models: [], sceneCodes: [] }]),
  );

  for (const route of routes) {
    const sceneCode = String(route.scene_code || "").trim();
    const models = uniqueStrings([route.primary_model, route.fallback_model, route.shadow_model]);
    for (const model of models) {
      const provider = inferProvider(model);
      if (!provider) {
        continue;
      }
      const current = routeScopeMap.get(provider)!;
      current.models = uniqueStrings([...current.models, model]);
      current.sceneCodes = uniqueStrings([...current.sceneCodes, sceneCode]);
    }
  }

  const providers = await Promise.all(PROVIDERS.map(async (provider) => {
    const scope = routeScopeMap.get(provider)!;
    const credential = getProviderCredential(provider);

    if (scope.models.length === 0) {
      return {
        provider,
        status: "unused",
        envConfigured: credential.envConfigured,
        envKeyLabel: credential.envKeyLabel,
        probeModel: null,
        models: [],
        sceneCodes: [],
        lastProbeAt: null,
        statusCode: null,
        error: null,
        latencyMs: null,
      } satisfies AiCredentialProviderHealth;
    }

    if (!credential.envConfigured || !credential.apiKey) {
      return {
        provider,
        status: "missing_env",
        envConfigured: false,
        envKeyLabel: credential.envKeyLabel,
        probeModel: scope.models[0] ?? null,
        models: scope.models,
        sceneCodes: scope.sceneCodes,
        lastProbeAt: null,
        statusCode: null,
        error: `缺少 ${credential.envKeyLabel}`,
        latencyMs: null,
      } satisfies AiCredentialProviderHealth;
    }

    const startedAt = Date.now();
    const lastProbeAt = new Date().toISOString();

    try {
      const probe = await probeProvider(provider, scope.models[0], credential.apiKey);
      return {
        provider,
        status: probe.ok ? "healthy" : "probe_failed",
        envConfigured: true,
        envKeyLabel: credential.envKeyLabel,
        probeModel: scope.models[0] ?? null,
        models: scope.models,
        sceneCodes: scope.sceneCodes,
        lastProbeAt,
        statusCode: probe.statusCode,
        error: probe.error,
        latencyMs: Date.now() - startedAt,
      } satisfies AiCredentialProviderHealth;
    } catch (error) {
      return {
        provider,
        status: "probe_failed",
        envConfigured: true,
        envKeyLabel: credential.envKeyLabel,
        probeModel: scope.models[0] ?? null,
        models: scope.models,
        sceneCodes: scope.sceneCodes,
        lastProbeAt,
        statusCode: null,
        error: error instanceof Error ? error.message : "unknown error",
        latencyMs: Date.now() - startedAt,
      } satisfies AiCredentialProviderHealth;
    }
  }));

  return {
    generatedAt: new Date().toISOString(),
    ttlSeconds: Math.floor(CACHE_TTL_MS / 1000),
    providers,
  };
}

export async function getCredentialHealthMatrix() {
  const now = Date.now();
  if (cacheEntry && cacheEntry.expiresAt > now) {
    return cacheEntry.value;
  }
  if (inFlightMatrixPromise) {
    return inFlightMatrixPromise;
  }

  inFlightMatrixPromise = loadHealthMatrix()
    .then((value) => {
      cacheEntry = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      inFlightMatrixPromise = null;
    });

  return inFlightMatrixPromise;
}

export function clearAiCredentialHealthCache() {
  cacheEntry = null;
  inFlightMatrixPromise = null;
}
