export type HotspotScoreTier = "breaking" | "rising" | "steady" | "weak";

export type HotspotScoreInput = {
  title: string;
  providerCount?: number | null;
  ranks?: Array<number | null | undefined>;
  heatValues?: Array<number | null | undefined>;
  capturedAt?: string | null;
  now?: string | Date | null;
  topicFitScore?: number | null;
  sourceReliabilityScore?: number | null;
  recentlyUsed?: boolean | null;
  similarRecentCount?: number | null;
};

export type HotspotScore = {
  score: number;
  tier: HotspotScoreTier;
  reasons: string[];
  providerCount: number;
  bestRank: number | null;
  recencyMinutes: number | null;
  noveltyPenalty: number;
  sourceReliabilityScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumbers(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function getRecencyMinutes(capturedAt: string | null | undefined, now: string | Date | null | undefined) {
  if (!capturedAt) return null;
  const captured = Date.parse(capturedAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now || new Date().toISOString()));
  if (!Number.isFinite(captured) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.round((current - captured) / 60_000));
}

function rankScore(bestRank: number | null) {
  if (!bestRank) return 8;
  if (bestRank <= 3) return 28;
  if (bestRank <= 10) return 22;
  if (bestRank <= 30) return 14;
  return 6;
}

function heatValueScore(values: number[]) {
  if (values.length === 0) return 0;
  const max = Math.max(...values);
  if (max >= 1_000_000) return 16;
  if (max >= 100_000) return 12;
  if (max >= 10_000) return 8;
  return 4;
}

function recencyScore(minutes: number | null) {
  if (minutes == null) return 4;
  if (minutes <= 30) return 16;
  if (minutes <= 180) return 12;
  if (minutes <= 720) return 8;
  if (minutes <= 1440) return 4;
  return 0;
}

function tierFromScore(score: number): HotspotScoreTier {
  if (score >= 78) return "breaking";
  if (score >= 58) return "rising";
  if (score >= 36) return "steady";
  return "weak";
}

export function scoreChineseHotspot(input: HotspotScoreInput): HotspotScore {
  const ranks = finiteNumbers(input.ranks || []);
  const heatValues = finiteNumbers(input.heatValues || []);
  const providerCount = Math.max(1, Math.floor(Number(input.providerCount || 1)));
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  const recencyMinutes = getRecencyMinutes(input.capturedAt, input.now);
  const sourceReliabilityScore = clamp(Number(input.sourceReliabilityScore ?? 8), 0, 12);
  const topicFitScore = clamp(Number(input.topicFitScore ?? 8), 0, 14);
  const crossPlatformScore = clamp((providerCount - 1) * 14, 0, 28);
  const similarRecentCount = Math.max(0, Math.floor(Number(input.similarRecentCount || 0)));
  const noveltyPenalty = clamp((input.recentlyUsed ? 20 : 0) + similarRecentCount * 6, 0, 36);

  const rawScore =
    rankScore(bestRank)
    + crossPlatformScore
    + recencyScore(recencyMinutes)
    + heatValueScore(heatValues)
    + topicFitScore
    + sourceReliabilityScore
    - noveltyPenalty;
  const score = clamp(Math.round(rawScore), 0, 100);
  const reasons: string[] = [];
  if (providerCount > 1) reasons.push(`跨 ${providerCount} 个平台出现`);
  if (bestRank != null) reasons.push(`最高排名第 ${bestRank}`);
  if (recencyMinutes != null) reasons.push(`${recencyMinutes} 分钟内捕获`);
  if (heatValues.length > 0) reasons.push("包含平台热度值");
  if (topicFitScore >= 10) reasons.push("与账号垂类匹配");
  if (noveltyPenalty > 0) reasons.push(`近期重复降权 ${noveltyPenalty}`);
  if (reasons.length === 0) reasons.push("基础热点信号完整");

  return {
    score,
    tier: tierFromScore(score),
    reasons,
    providerCount,
    bestRank,
    recencyMinutes,
    noveltyPenalty,
    sourceReliabilityScore,
  };
}
