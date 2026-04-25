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

export function shouldPreferOpenAiChatCompletionsStream() {
  const explicit = String(process.env.OPENAI_STREAM_PREFERRED || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(explicit)) {
    return false;
  }
  try {
    return new URL(getOpenAiBaseUrl()).hostname !== "api.openai.com";
  } catch {
    return true;
  }
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

export function getOpenAiChatCompletionsUrl() {
  return joinUrl(getOpenAiBaseUrl(), "chat/completions");
}

export function getAnthropicMessagesUrl() {
  return joinUrl(getAnthropicBaseUrl(), "messages");
}

export function getGeminiGenerateContentUrl(model: string, apiKey: string) {
  return `${joinUrl(getGeminiBaseUrl(), `models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
}
