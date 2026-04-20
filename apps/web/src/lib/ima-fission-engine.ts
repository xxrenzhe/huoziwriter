import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { getActiveImaContext, markImaConnectionInvalid, normalizeImaError } from "./ima-connections";
import { ImaApiError, searchKnowledge } from "./ima-client";
import { loadPrompt } from "./prompt-loader";
import type {
  TopicFissionCandidate,
  TopicFissionCorpusEvidence,
  TopicFissionMode,
  TopicFissionResult,
} from "./topic-fission";
import type { RankedTopicRecommendation } from "./topic-recommendations";

type DistilledHookPattern = {
  name?: string;
  description?: string;
  triggerPsychology?: string;
};

type DistilledAngle = {
  title?: string;
  fissionMode?: string;
  targetReader?: string;
  description?: string;
  sampleTitles?: string[];
};

function asStringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit)
    : [];
}

function mapMode(value: unknown, fallback: TopicFissionMode): TopicFissionMode {
  if (value === "contrast" || value === "cross-domain") return value;
  if (value === "regularity") return value;
  return fallback;
}

export async function runImaFissionEngine(input: {
  userId: number;
  topic: RankedTopicRecommendation;
  mode: TopicFissionMode;
  sourceTrackLabel: string;
  targetTrackLabel: string | null;
  buildCandidate: (input: {
    index: number;
    topic: RankedTopicRecommendation;
    mode: TopicFissionMode;
    title: string;
    description: string;
    targetReader: string;
    sourceTrackLabel: string;
    targetTrackLabel?: string | null;
    corpusEvidence?: TopicFissionCorpusEvidence[];
  }) => TopicFissionCandidate;
}): Promise<TopicFissionResult> {
  const active = await getActiveImaContext(input.userId);
  const prompt = await loadPrompt("ima_hook_pattern_distill");
  const searchQuery = [input.topic.title, input.topic.summary]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 120);
  const searchResult = await searchKnowledge(active.creds, active.kbId, searchQuery || input.topic.title, "");
  const samples = searchResult.items
    .filter((item) => item.highlightContent)
    .slice(0, 12)
    .map((item) => ({
      title: item.title,
      highlightContent: item.highlightContent,
      sourceUrl: item.sourceUrl,
    }));

  if (samples.length < 3) {
    throw new Error(`IMA 知识库「${active.kbName}」命中不足，先换个关键词或知识库再试`);
  }

  const generated = await generateSceneText({
    sceneCode: "imaHookPatternDistill",
    systemPrompt: prompt,
    userPrompt: JSON.stringify({
      query: searchQuery || input.topic.title,
      persona: input.topic.matchedPersonaName || null,
      samples: samples.map((item) => ({
        title: item.title,
        highlightContent: item.highlightContent,
      })),
    }),
    temperature: 0.3,
  });

  const payload = extractJsonObject(generated.text) as {
    hookPatterns?: DistilledHookPattern[];
    differentiatedAngles?: DistilledAngle[];
  };
  const hookPatterns = Array.isArray(payload.hookPatterns) ? payload.hookPatterns.slice(0, 4) : [];
  const angles = Array.isArray(payload.differentiatedAngles) ? payload.differentiatedAngles.slice(0, 6) : [];
  if (hookPatterns.length === 0 || angles.length === 0) {
    throw new Error("IMA 裂变提炼结果为空");
  }

  const sampleMap = new Map(samples.map((item) => [item.title, item]));
  const candidates = angles
    .map((angle, index) => {
      const title = String(angle.title || "").trim();
      const description = String(angle.description || "").trim();
      const targetReader = String(angle.targetReader || "").trim();
      if (!title || !description || !targetReader) return null;
      const corpusEvidence = asStringArray(angle.sampleTitles, 3)
        .map((sampleTitle) => sampleMap.get(sampleTitle))
        .filter(Boolean)
        .map((item) => ({
          title: item!.title,
          sourceUrl: item!.sourceUrl,
        }));
      return input.buildCandidate({
        index,
        topic: input.topic,
        mode: mapMode(angle.fissionMode, input.mode),
        title,
        description,
        targetReader,
        sourceTrackLabel: input.sourceTrackLabel,
        targetTrackLabel: input.targetTrackLabel,
        corpusEvidence,
      });
    })
    .filter(Boolean) as TopicFissionCandidate[];

  if (candidates.length === 0) {
    throw new Error("IMA 裂变没有生成可用候选");
  }

  return {
    topicId: input.topic.id,
    topicTitle: input.topic.title,
    mode: input.mode,
    modeLabel:
      input.mode === "contrast"
        ? "差异化"
        : input.mode === "cross-domain"
          ? "跨赛道迁移"
          : "规律裂变",
    sourceTrackLabel: input.sourceTrackLabel,
    targetTrackLabel: input.targetTrackLabel,
    signalGroups: [
      {
        label: "爆点规律",
        items: hookPatterns
          .map((item) => {
            const name = String(item.name || "").trim();
            const description = String(item.description || "").trim();
            return name && description ? `${name}：${description}` : "";
          })
          .filter(Boolean),
      },
      {
        label: "触发心理",
        items: hookPatterns
          .map((item) => {
            const name = String(item.name || "").trim();
            const triggerPsychology = String(item.triggerPsychology || "").trim();
            return name && triggerPsychology ? `${name}：${triggerPsychology}` : "";
          })
          .filter(Boolean),
      },
    ].filter((item) => item.items.length > 0),
    candidates,
    engine: "ima",
    degradedReason: null,
  };
}

export async function safeRunImaFissionEngine(input: Parameters<typeof runImaFissionEngine>[0]) {
  try {
    return await runImaFissionEngine(input);
  } catch (error) {
    if (error instanceof ImaApiError && (error.code === 1100 || error.code === 1101)) {
      try {
        const active = await getActiveImaContext(input.userId);
        await markImaConnectionInvalid({
          userId: input.userId,
          connectionId: active.connectionId,
          error: error.message,
        });
      } catch {
        // Ignore best-effort invalid marking.
      }
    }
    throw new Error(normalizeImaError(error));
  }
}
