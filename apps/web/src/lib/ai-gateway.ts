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
};

type GatewayResult = {
  text: string;
  model: string;
  provider: Provider;
};

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

async function getSceneRoute(sceneCode: SupportedSceneCode): Promise<SceneRoute> {
  const db = getDatabase();
  const candidateSceneCodes = [sceneCode];
  let route: { primary_model: string; fallback_model: string | null } | null = null;
  for (const candidateSceneCode of candidateSceneCodes) {
    const foundRoute = await db.queryOne<{ primary_model: string; fallback_model: string | null }>(
      "SELECT primary_model, fallback_model FROM ai_model_routes WHERE scene_code = ?",
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

async function callOpenAI(model: string, systemPrompt: string, userPrompt: string, temperature: number) {
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
    throw new Error(payload?.error?.message || `OpenAI 请求失败，HTTP ${response.status}`);
  }
  return extractOpenAIText(payload);
}

async function callAnthropic(model: string, systemPrompt: string, userPrompt: string, temperature: number) {
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
    throw new Error(payload?.error?.message || `Anthropic 请求失败，HTTP ${response.status}`);
  }
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

async function callGemini(model: string, systemPrompt: string, userPrompt: string, temperature: number) {
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
    throw new Error(payload?.error?.message || `Gemini 请求失败，HTTP ${response.status}`);
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
  return text;
}

async function callProvider(provider: Provider, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  if (provider === "openai") {
    return callOpenAI(model, systemPrompt, userPrompt, temperature);
  }
  if (provider === "anthropic") {
    return callAnthropic(model, systemPrompt, userPrompt, temperature);
  }
  return callGemini(model, systemPrompt, userPrompt, temperature);
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
  temperature?: number;
}) {
  const route = await getSceneRoute(input.sceneCode);
  const models = [route.primaryModel, route.fallbackModel].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
  const errors: string[] = [];

  for (const model of models) {
    const provider = inferProvider(model);
    try {
      const text = await callProvider(
        provider,
        model,
        input.systemPrompt,
        input.userPrompt,
        input.temperature ?? 0.3,
      );
      return {
        text,
        model,
        provider,
      } satisfies GatewayResult;
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`${input.sceneCode} 调用失败：${errors.join(" | ")}`);
}
