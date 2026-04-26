import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  buildCuratedResearchPlans,
  buildImaResearchPlans,
  buildResearchSearchPlans,
  detectVerticalTopicCategory,
  filterReachableCuratedResearchPlans,
  scoreImaResult,
  scoreResultForCategory,
} from "../article-research-supplement";

test("buildResearchSearchPlans expands category-specific research queries", () => {
  const plans = buildResearchSearchPlans({
    articleTitle: "请生成一篇关于 AI 自动写作工作流闭环并同步到微信草稿箱",
    knowledgeCards: [
      { title: "AI 工作流自动化", summary: "涉及写作、核查、排版和发布" },
    ],
    outlineNodes: [
      { title: "为什么研究不足会卡住正文", description: "需要前置门控" },
    ],
    searchHints: {
      topicTheme: "AI 自动写作工作流",
      coreAssertion: "真正闭环取决于研究、事实核查和发布前门控",
      missingCategories: ["官方源", "用户反馈", "时间线"],
      mustCoverAngles: ["官方接口变化", "真实用户反馈", "版本演进"],
    },
  });

  assert.equal(plans.length, 5);
  assert.equal(plans[0]?.category, "official");
  assert.equal(plans[1]?.category, "userVoice");
  assert.equal(plans[2]?.category, "timeline");
  assert.match(plans[0]?.query || "", /官方|docs|API/i);
  assert.match(plans[1]?.query || "", /用户|反馈|review|forum/i);
  assert.match(plans[2]?.query || "", /时间线|版本|timeline|release/i);
  assert.ok((plans[0]?.siteQueries || []).length > 0);
  assert.doesNotMatch(plans[0]?.query || "", /同步到微信草稿箱/);
});

test("buildResearchSearchPlans prefers wechat official domains for public-account topics", () => {
  const plans = buildResearchSearchPlans({
    articleTitle: "公众号内容工作流如何接入微信草稿箱闭环",
    knowledgeCards: [],
    outlineNodes: [],
    searchHints: {
      topicTheme: "公众号自动发布",
      missingCategories: ["官方源", "时间线"],
    },
  });

  const officialPlan = plans.find((item) => item.category === "official");
  assert.ok((officialPlan?.preferredDomains || []).some((item) => /weixin\.qq\.com$/.test(item)));
  assert.ok((officialPlan?.siteQueries || []).some((item) => /site:developers\.weixin\.qq\.com|site:mp\.weixin\.qq\.com/.test(item)));
});

test("buildImaResearchPlans compacts article intent into short KB queries", () => {
  const plans = buildImaResearchPlans({
    articleTitle: "为什么公众号 AI 自动写作工作流会卡在研究和草稿箱之间",
    knowledgeCards: [{ title: "公众号工作流复盘", summary: "涉及研究、写作、草稿箱和发布链路" }],
    outlineNodes: [{ title: "研究门控为什么必须前置", description: "避免正文节奏被补证打断" }],
    searchHints: {
      coreQuestion: "公众号自动写作为什么总在研究与草稿箱之间卡住",
      mustCoverAngles: ["研究门控", "草稿箱发布"],
    },
  });

  assert.ok(plans.length >= 2);
  assert.ok(plans.every((item) => item.query.length <= 96));
  assert.ok(plans.some((item) => /公众号|草稿箱|研究/.test(item.query)));
});

test("buildCuratedResearchPlans adds high-quality direct sources before broad search", () => {
  const plans = buildCuratedResearchPlans({
    articleTitle: "公众号自动发布工作流如何接入微信草稿箱",
    knowledgeCards: [],
    outlineNodes: [],
    searchHints: {
      topicTheme: "微信公众平台自动化",
      mustCoverAngles: ["官方接口", "发布时间线"],
    },
  });

  assert.ok(plans.some((item) => item.url.includes("developers.weixin.qq.com")));
  assert.ok(plans.some((item) => item.category === "official"));
});

test("detectVerticalTopicCategory identifies business-oriented verticals instead of falling back to AI tooling", () => {
  assert.equal(detectVerticalTopicCategory(["海外赚美金", "远程接单", "数字产品变现"]), "overseas_income");
  assert.equal(detectVerticalTopicCategory(["职场晋升", "绩效压力", "管理者"]), "career");
  assert.equal(detectVerticalTopicCategory(["联盟营销", "佣金", "SEO 变现"]), "affiliate_marketing");
  assert.equal(detectVerticalTopicCategory(["AI产品", "Agent 产品化", "Product Hunt"]), "ai_products");
  assert.equal(detectVerticalTopicCategory(["副业赚钱", "第二收入", "个人品牌变现"]), "side_hustles");
});

test("buildCuratedResearchPlans uses overseas-income source pack for赚美金 topics", () => {
  const plans = buildCuratedResearchPlans({
    articleTitle: "海外赚美金有哪些稳定路径",
    knowledgeCards: [],
    outlineNodes: [],
    searchHints: {
      topicTheme: "远程接单与数字产品变现",
      mustCoverAngles: ["平台规则", "收款方式", "真实案例"],
    },
  });

  assert.ok(plans.some((item) => /wise|stripe|indiehackers|shopify/i.test(item.url)));
  assert.ok(!plans.every((item) => /openai|anthropic|langchain/i.test(item.url)));
});

test("filterReachableCuratedResearchPlans keeps only sources that current fetcher can actually read", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<html><head><title>Reachable source</title></head><body><article>这是一段足够长的正文内容。".repeat(30) + "</article></body></html>");
      return;
    }
    response.writeHead(403, { "content-type": "text/html; charset=utf-8" });
    response.end("<html><head><title>blocked</title></head><body>blocked</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  try {
    const plans = await filterReachableCuratedResearchPlans([
      { category: "official", label: "ok", url: `http://127.0.0.1:${port}/ok` },
      { category: "official", label: "blocked", url: `http://127.0.0.1:${port}/blocked` },
    ]);

    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.label, "ok");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("buildResearchSearchPlans uses affiliate-specific domains for affiliate marketing topics", () => {
  const plans = buildResearchSearchPlans({
    articleTitle: "联盟营销怎么找到稳定佣金渠道",
    knowledgeCards: [],
    outlineNodes: [],
    searchHints: {
      topicTheme: "Affiliate marketing",
      mustCoverAngles: ["平台条款", "佣金调整", "SEO 流量"],
    },
  });

  const officialPlan = plans.find((item) => item.category === "official");
  const comparisonPlan = plans.find((item) => item.category === "comparison");
  assert.ok((officialPlan?.preferredDomains || []).some((item) => /amazon|ahrefs|backlinko|authorityhacker/i.test(item)));
  assert.ok((comparisonPlan?.preferredDomains || []).some((item) => /amazon|ahrefs|backlinko|authorityhacker/i.test(item)));
});

test("scoreImaResult prefers substantive case-like materials over generic landing-page hits", () => {
  const topicTerms = ["公众号", "自动写作", "工作流"];

  const genericScore = scoreImaResult({
    title: "docs",
    excerpt: "文档总览",
    sourceUrl: "https://ai.google.dev/gemini-api/docs",
    topicTerms,
  });
  const substantiveScore = scoreImaResult({
    title: "公众号 AI 写作工作流复盘",
    excerpt: "这是一次围绕公众号选题、写作、核查和发布链路的实战复盘。",
    sourceUrl: null,
    topicTerms,
  });

  assert.ok(substantiveScore > genericScore);
});

test("scoreResultForCategory penalizes generic landing pages for official evidence", () => {
  const genericScore = scoreResultForCategory("official", {
    title: "overview",
    url: "https://platform.openai.com/docs/overview",
    content: "平台文档总览",
  }, ["platform.openai.com"], "base", ["openai", "写作工作流"]);
  const substantiveScore = scoreResultForCategory("official", {
    title: "Assistants API release notes",
    url: "https://platform.openai.com/docs/changelog",
    content: "release changelog for api updates and capabilities",
  }, ["platform.openai.com"], "base", ["openai", "写作工作流"]);

  assert.ok(substantiveScore > genericScore);
});
