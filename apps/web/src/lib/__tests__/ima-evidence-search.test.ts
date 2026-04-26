import assert from "node:assert/strict";
import test from "node:test";

import { buildImaQueryVariants, rankImaKnowledgeBasesForQuery } from "../ima-evidence-search";

test("buildImaQueryVariants falls back from long intent to short searchable terms", () => {
  const variants = buildImaQueryVariants("AI 自动写作 工作流 公众号");

  assert.equal(variants[0], "AI 自动写作 工作流 公众号");
  assert.ok(variants.includes("自动写作"));
  assert.ok(variants.includes("工作流"));
  assert.ok(variants.includes("公众号"));
});

test("rankImaKnowledgeBasesForQuery prefers topic-matched KB over unrelated default KB", () => {
  const ranked = rankImaKnowledgeBasesForQuery({
    query: "AI 自动写作 工作流 公众号",
    knowledgeBases: [
      {
        kbId: "default-outbound",
        kbName: "AI出海与跨境电商",
        description: "AI 出海、跨境电商、赚美元",
        isDefault: true,
      },
      {
        kbId: "wechat-viral",
        kbName: "公众号10W+爆文素材库(持续更新)",
        description: "收录近一年，全网所有赛道10W+公众号文章",
        isDefault: false,
      },
      {
        kbId: "personal",
        kbName: "Jason大师兄的知识库",
        description: null,
        isDefault: false,
      },
    ],
  });

  assert.equal(ranked[0], "wechat-viral");
  assert.ok(ranked.indexOf("default-outbound") > 0);
});

test("rankImaKnowledgeBasesForQuery prefers affiliate-specific KB for affiliate topics", () => {
  const ranked = rankImaKnowledgeBasesForQuery({
    query: "联盟营销 SEO 变现 佣金",
    knowledgeBases: [
      {
        kbId: "wechat-viral",
        kbName: "公众号10W+爆文素材库(持续更新)",
        description: "收录近一年，全网所有赛道10W+公众号文章",
        isDefault: false,
      },
      {
        kbId: "ai-outbound",
        kbName: "AI出海与跨境电商",
        description: "AI 出海、跨境电商、赚美元",
        isDefault: true,
      },
      {
        kbId: "affiliate-seo",
        kbName: "联盟营销与SEO案例库",
        description: "Affiliate、SEO、站长、佣金变现",
        isDefault: false,
      },
    ],
  });

  assert.equal(ranked[0], "affiliate-seo");
  assert.ok(ranked.indexOf("wechat-viral") >= 0);
});
