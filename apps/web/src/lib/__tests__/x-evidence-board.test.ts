import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceItemsFromXEvidenceBoard, buildXEvidenceBoard } from "../x-evidence-board";

test("buildXEvidenceBoard combines social signal and external verification into a usable board", async () => {
  const board = await buildXEvidenceBoard({
    title: "Anthropic年收入突然被热议",
    summary: "X 上围绕 ARR 和企业客户增长出现了集中讨论。",
    sourceUrl: "https://x.com/aakashg0/status/19001",
    sourceMeta: {
      postId: "19001",
      authorHandle: "aakashg0",
      authorName: "Aakash Gupta",
      postedAt: "2026-04-29T09:00:00Z",
      textRaw: "Anthropic just crossed a major ARR milestone. Enterprise buyers are clearly shifting attention.",
      metrics: { like_count: 320, retweet_count: 88, reply_count: 17 },
      externalLinks: ["https://www.wsj.com/tech/ai/test"],
      referencedPosts: [
        {
          postId: "19002",
          textRaw: "This is not just a vanity number. It says a lot about B2B willingness to pay.",
          authorHandle: "reporter1",
          authorName: "Reporter 1",
          createdAt: "2026-04-29T09:20:00Z",
        },
      ],
    },
    fetcher: async () => ({
      text: "<html><head><title>WSJ: Anthropic Revenue Climbs</title><meta name=\"description\" content=\"Anthropic annual recurring revenue climbed as enterprise demand grew.\" /></head><body></body></html>",
    }),
  });

  assert.match(board.whyNow, /外链证据|即时事件信号|快速聚焦/);
  assert.equal(board.originSignal.firstBreakHandle, "aakashg0");
  assert.equal(board.verificationHits.length, 1);
  assert.equal(board.audienceImpact.length > 0, true);
  assert.equal(board.coreClaims.length > 0, true);
});

test("buildEvidenceItemsFromXEvidenceBoard maps board into article evidence items", async () => {
  const board = await buildXEvidenceBoard({
    title: "副业案例突然在 X 上爆了",
    summary: "围绕副业收入和自动化漏斗的讨论在快速扩散。",
    sourceUrl: "https://x.com/solopreneur/status/19003",
    sourceMeta: {
      postId: "19003",
      authorHandle: "solopreneur",
      postedAt: "2026-04-29T10:00:00Z",
      textRaw: "I hit $12k MRR with a small side hustle funnel. Here is what actually worked.",
      externalLinks: [],
    },
  });
  const items = buildEvidenceItemsFromXEvidenceBoard({
    board,
    sourceUrl: "https://x.com/solopreneur/status/19003",
    nodeId: 12,
  });

  assert.equal(items.length > 0, true);
  assert.equal(items.some((item) => item.researchTag === "userVoice"), true);
  assert.equal(items.some((item) => item.evidenceRole === "counterEvidence"), true);
});
