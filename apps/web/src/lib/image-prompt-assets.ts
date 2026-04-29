export type ReusableImagePrompt = {
  prompt: string;
  negativePrompt: string | null;
  promptHash: string | null;
  provider: string | null;
  model: string | null;
  aspectRatio: string | null;
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function extractReusableImagePrompt(input: {
  prompt?: unknown;
  negativePrompt?: unknown;
  promptHash?: unknown;
  provider?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  manifest?: Record<string, unknown> | null;
}): ReusableImagePrompt | null {
  const manifest = input.manifest ?? null;
  const baoyuManifest = readRecord(manifest?.baoyu);
  const prompt =
    readString(input.prompt)
    || readString(manifest?.prompt)
    || readString(baoyuManifest?.prompt)
    || readString(baoyuManifest?.promptText);
  if (!prompt) return null;

  return {
    prompt,
    negativePrompt:
      readString(input.negativePrompt)
      || readString(manifest?.negativePrompt)
      || readString(baoyuManifest?.negativePrompt),
    promptHash:
      readString(input.promptHash)
      || readString(manifest?.promptHash)
      || readString(baoyuManifest?.promptHash),
    provider: readString(input.provider) || readString(manifest?.provider),
    model: readString(input.model) || readString(manifest?.model),
    aspectRatio: readString(input.aspectRatio) || readString(manifest?.size) || readString(baoyuManifest?.aspectRatio),
  };
}

export function summarizeReusableImagePrompt(prompt: ReusableImagePrompt | null, maxLength = 96) {
  if (!prompt) return null;
  const text = prompt.prompt.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}
