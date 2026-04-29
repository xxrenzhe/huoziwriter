import assert from "node:assert/strict";
import test from "node:test";

import { scoreChineseHotspot } from "../chinese-hotspot-score";

test("scoreChineseHotspot rewards cross-platform and rank signals with readable reasons", () => {
  const single = scoreChineseHotspot({
    title: "某 AI 产品发布新版本",
    providerCount: 1,
    ranks: [18],
    capturedAt: "2026-04-29T08:00:00.000Z",
    now: "2026-04-29T09:00:00.000Z",
    topicFitScore: 8,
    sourceReliabilityScore: 8,
  });
  const crossPlatform = scoreChineseHotspot({
    title: "某 AI 产品发布新版本",
    providerCount: 3,
    ranks: [8, 12, 3],
    heatValues: [120_000],
    capturedAt: "2026-04-29T08:45:00.000Z",
    now: "2026-04-29T09:00:00.000Z",
    topicFitScore: 12,
    sourceReliabilityScore: 10,
  });

  assert(crossPlatform.score > single.score);
  assert.equal(crossPlatform.providerCount, 3);
  assert.equal(crossPlatform.bestRank, 3);
  assert(crossPlatform.reasons.some((item) => item.includes("跨 3 个平台")));
  assert(crossPlatform.reasons.some((item) => item.includes("最高排名第 3")));
});

test("scoreChineseHotspot applies novelty penalty for recently used topics", () => {
  const fresh = scoreChineseHotspot({
    title: "跨境工具出现新价格战",
    providerCount: 2,
    ranks: [6, 9],
    capturedAt: "2026-04-29T08:00:00.000Z",
    now: "2026-04-29T08:30:00.000Z",
  });
  const repeated = scoreChineseHotspot({
    title: "跨境工具出现新价格战",
    providerCount: 2,
    ranks: [6, 9],
    capturedAt: "2026-04-29T08:00:00.000Z",
    now: "2026-04-29T08:30:00.000Z",
    recentlyUsed: true,
    similarRecentCount: 2,
  });

  assert(repeated.score < fresh.score);
  assert(repeated.noveltyPenalty > 0);
  assert(repeated.reasons.some((item) => item.includes("近期重复降权")));
});
