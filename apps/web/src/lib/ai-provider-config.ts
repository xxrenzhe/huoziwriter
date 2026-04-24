const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function normalizeBaseUrl(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "").trim() || fallback;
  return normalized.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function getOpenAiBaseUrl() {
  return normalizeBaseUrl(process.env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL);
}

export function getAnthropicBaseUrl() {
  return normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL);
}

export function getGeminiBaseUrl() {
  return normalizeBaseUrl(process.env.GEMINI_BASE_URL, DEFAULT_GEMINI_BASE_URL);
}

export function getOpenAiResponsesUrl() {
  return joinUrl(getOpenAiBaseUrl(), "responses");
}

export function getAnthropicMessagesUrl() {
  return joinUrl(getAnthropicBaseUrl(), "messages");
}

export function getGeminiGenerateContentUrl(model: string, apiKey: string) {
  return `${joinUrl(getGeminiBaseUrl(), `models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
}
