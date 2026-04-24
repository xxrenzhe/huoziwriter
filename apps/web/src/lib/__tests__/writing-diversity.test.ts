import assert from "node:assert/strict";
import test from "node:test";

import { buildWritingDiversityReport } from "../writing-diversity";

test("buildWritingDiversityReport includes opening quality ceiling in repeat suggestions", () => {
  const report = buildWritingDiversityReport({
    currentArticle: {
      id: 99,
      title: "当前稿件",
      markdownContent: "最近很多人都在谈 AI 写作，但大多数讨论还停留在现象层。",
    },
    recentArticles: [
      { id: 1, title: "近作 A", markdownContent: "最近很多人都在谈增长，但真正的问题还没被拆开。" },
      { id: 2, title: "近作 B", markdownContent: "这两年很多人盯着模型参数，却忽略了交付口径。" },
      { id: 3, title: "近作 C", markdownContent: "行业里最近都在聊效率，可真正先承压的是流程设计。" },
    ],
    recentDeepWritingStates: [],
  });

  assert.equal(report.status, "needs_attention");
  assert(report.suggestions.some((item) => item.includes("质量上限 B-")));
  assert(report.suggestions.some((item) => item.includes("场景切入") || item.includes("结论先放")));
});

test("buildWritingDiversityReport stays balanced when recent openings do not collide", () => {
  const report = buildWritingDiversityReport({
    currentArticle: {
      id: 99,
      title: "当前稿件",
      markdownContent: "上周我帮朋友改稿，改到一半我把电脑关了，因为第一段根本没有冲突。",
    },
    recentArticles: [
      { id: 1, title: "近作 A", markdownContent: "先说结论：一篇稿子的开头，往往比标题更决定完读率。" },
      { id: 2, title: "近作 B", markdownContent: "为什么有些文章看起来信息很多，读者却读不下去？" },
    ],
    recentDeepWritingStates: [],
  });

  assert.equal(report.status, "balanced");
  assert.equal(report.issues.length, 0);
});
