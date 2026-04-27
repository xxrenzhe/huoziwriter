import assert from "node:assert/strict";
import test from "node:test";

import { getArticleEvidenceStats } from "../article-evidence";

test("getArticleEvidenceStats keeps internal notes below WeChat publish floor", () => {
  const stats = getArticleEvidenceStats([
    {
      title: "作者观察",
      excerpt: "这是一条来自作者经验的判断，不能独立核验。",
      sourceType: "author_framework",
    },
    {
      title: "编辑判断",
      excerpt: "这是一条编辑侧归纳，不能替代外部信源。",
      sourceType: "editorial_observation",
    },
    {
      title: "手工素材",
      excerpt: "这是一条没有 URL 或截图的手工补充。",
      sourceType: "manual",
    },
  ]);

  assert.equal(stats.ready, false);
  assert.equal(stats.publishReady, false);
  assert.equal(stats.verifiableEvidenceCount, 0);
  assert.equal(stats.verifiableSourceTypeCount, 0);
  assert.match(stats.detail, /外部来源或截图证据/);
});

test("getArticleEvidenceStats does not treat one external link plus internal notes as publish-ready", () => {
  const stats = getArticleEvidenceStats([
    {
      title: "外部报道",
      excerpt: "这条材料有外部 URL，可以核验。",
      sourceType: "article",
      sourceUrl: "https://example.com/report",
    },
    {
      title: "作者框架",
      excerpt: "这条材料来自作者框架，不能独立核验。",
      sourceType: "author_framework",
    },
    {
      title: "编辑观察",
      excerpt: "这条材料来自编辑观察，不能独立核验。",
      sourceType: "editorial_observation",
    },
  ]);

  assert.equal(stats.ready, true);
  assert.equal(stats.publishReady, false);
  assert.equal(stats.verifiableEvidenceCount, 1);
  assert.deepEqual(stats.flags.includes("可核验证据不足 2 条"), true);
});

test("getArticleEvidenceStats marks diverse verifiable sources as WeChat publish-ready", () => {
  const stats = getArticleEvidenceStats([
    {
      title: "行业报告",
      excerpt: "这条材料来自行业报告，有可核验链接。",
      sourceType: "official_report",
      sourceUrl: "https://example.com/report",
    },
    {
      title: "IMA 知识库素材",
      excerpt: "这条材料来自已经入库的知识库素材。",
      sourceType: "ima_knowledge_base",
    },
    {
      title: "用户反例",
      excerpt: "这条材料保留了用户侧反证。",
      sourceType: "v2ex",
      sourceUrl: "https://www.v2ex.com/t/123",
      evidenceRole: "counterEvidence",
    },
  ]);

  assert.equal(stats.ready, true);
  assert.equal(stats.publishReady, true);
  assert.equal(stats.verifiableEvidenceCount, 3);
  assert.equal(stats.verifiableSourceTypeCount, 3);
});
