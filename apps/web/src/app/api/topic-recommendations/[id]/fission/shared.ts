import type { TopicFissionCandidate, TopicFissionMode } from "@/lib/topic-fission";

function parseFissionMode(value: unknown): TopicFissionMode {
  if (value === "contrast" || value === "cross-domain") {
    return value;
  }
  return "regularity";
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

export function parseTopicFissionCandidate(value: unknown): TopicFissionCandidate {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!record) {
    throw new Error("裂变候选无效");
  }

  const title = sanitizeText(record.title, 120);
  const targetReader = sanitizeText(record.targetReader, 160);
  const description = sanitizeText(record.description, 400);
  const sourceTrackLabel = sanitizeText(record.sourceTrackLabel, 60);
  const modeLabel = sanitizeText(record.modeLabel, 20) || "规律裂变";
  if (!title || !targetReader || !description || !sourceTrackLabel) {
    throw new Error("裂变候选缺少必要字段");
  }

  const predictedFlipStrength = Math.max(0, Math.min(5, Math.round(Number(record.predictedFlipStrength) || 0)));
  const suggestedArchetype =
    record.suggestedArchetype === "opinion"
    || record.suggestedArchetype === "case"
    || record.suggestedArchetype === "howto"
    || record.suggestedArchetype === "hotTake"
    || record.suggestedArchetype === "phenomenon"
      ? record.suggestedArchetype
      : "phenomenon";

  return {
    id: sanitizeText(record.id, 40) || `candidate-${Date.now()}`,
    title,
    fissionMode: parseFissionMode(record.fissionMode),
    modeLabel,
    targetReader,
    description,
    predictedFlipStrength,
    sourceTrackLabel,
    targetTrackLabel: sanitizeText(record.targetTrackLabel, 60) || null,
    suggestedAngle: sanitizeText(record.suggestedAngle, 240) || `围绕《${title}》写清旧判断为什么失效。`,
    suggestedArchetype,
    suggestedCoreAssertion: sanitizeText(record.suggestedCoreAssertion, 240) || `${title} 值得写，不是因为它更新，而是因为旧判断已经失效。`,
    suggestedMainstreamBelief: sanitizeText(record.suggestedMainstreamBelief, 240) || `大众以为 ${title} 只是一个普通热点。`,
    suggestedWhyNow: sanitizeText(record.suggestedWhyNow, 240) || "这不是单点热度，而是正在蔓延的结构变化。",
  };
}
