import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleViralBlueprint,
  buildArticleViralBlueprintPromptLines,
  inferArticleViralBlueprintCode,
} from "../article-viral-blueprint";
import { buildArticlePromptQualityBrief } from "../article-prompt-quality-brief";
import { buildWritingStateKernel, resolveArticlePrototype } from "../writing-state";

test("viral blueprint detects ordinary breakthrough articles from identity gap and result gap", () => {
  const code = inferArticleViralBlueprintCode({
    articleTitle: "一个二本的女生，用免费的AI考上了北大。",
    strategyCard: {
      coreAssertion: "普通人靠免费 AI 在资源门槛里多争取了一次机会。",
    },
  });

  assert.equal(code, "ordinary_breakthrough");
});

test("ordinary breakthrough blueprint exposes reusable viral mechanics", () => {
  const blueprint = buildArticleViralBlueprint({
    articleTitle: "一个二本的女生，用免费的AI考上了北大。",
  });

  assert.equal(blueprint.label, "普通人逆袭型");
  assert.match(blueprint.titlePromise, /低起点身份/);
  assert(blueprint.narrativeArc.some((item) => /公共升维/.test(item)));
  assert(blueprint.evidenceRecipe.some((item) => /人物原话/.test(item)));
  assert.match(blueprint.shareTrigger, /普通人仍然可以多争取一次机会/);
});

test("quality brief injects ordinary breakthrough blueprint into upstream prompts", () => {
  const lines = buildArticlePromptQualityBrief("outlinePlanning", {
    articleTitle: "一个二本的女生，用免费的AI考上了北大。",
    strategyCard: {
      coreAssertion: "这不是 AI 工具教程，而是低起点个体借助免费工具穿过资源门槛的故事。",
    },
  });
  const text = lines.join("\n");

  assert.match(text, /爆文结构蓝图：普通人逆袭型/);
  assert.match(text, /低起点身份、关键杠杆和超预期结果/);
  assert.match(text, /个人命运切口加公共议题升维/);
});

test("writing state selects ordinary breakthrough prototype for the same structure", () => {
  const prototype = resolveArticlePrototype({
    title: "一个二本的女生，用免费的AI考上了北大。",
  });
  const kernel = buildWritingStateKernel({
    title: "一个二本的女生，用免费的AI考上了北大。",
    strategyCard: {
      coreAssertion: "免费 AI 不是神话，真正关键是普通人如何在低预算里把工具用到关键卡点。",
    },
  });

  assert.equal(prototype, "ordinary_breakthrough");
  assert.equal(kernel.articlePrototype, "ordinary_breakthrough");
  assert.equal(kernel.articlePrototypeLabel, "普通人逆袭型");
  assert.equal(kernel.progressiveRevealEnabled, true);
  assert(kernel.stateChecklist.some((item) => /蓝图叙事弧/.test(item)));
});

test("stage prompt lines map ordinary breakthrough to evidence and fact-check requirements", () => {
  const researchLines = buildArticleViralBlueprintPromptLines("researchBrief", {
    articleTitle: "一个二本的女生，用免费的AI考上了北大。",
  }).join("\n");
  const factCheckLines = buildArticleViralBlueprintPromptLines("factCheck", {
    articleTitle: "一个二本的女生，用免费的AI考上了北大。",
  }).join("\n");

  assert.match(researchLines, /研究阶段必须按蓝图补素材/);
  assert.match(researchLines, /结果锚点/);
  assert.match(factCheckLines, /结果锚点、身份标签、数字、截图和人物原话/);
});

test("viral blueprint detects money path articles and front-loads risk-aware material recipe", () => {
  const blueprint = buildArticleViralBlueprint({
    articleTitle: "普通人做联盟营销，怎么低成本赚到第一笔美金",
  });

  assert.equal(blueprint.code, "money_path");
  assert.equal(blueprint.label, "赚钱路径拆解型");
  assert.match(blueprint.titlePromise, /目标收益场景/);
  assert(blueprint.evidenceRecipe.some((item) => /钱流锚点/.test(item)));
  assert(blueprint.premiseChecklist.some((item) => /低成本验证/.test(item)));
  assert.match(blueprint.mediocrityRisk, /割韭菜/);
});

test("viral blueprint maps career and ai product topics to specialized upstream prompts", () => {
  const careerLines = buildArticleViralBlueprintPromptLines("outlinePlanning", {
    articleTitle: "这一轮裁员后，职场人真正要担心的不是 AI",
  }).join("\n");
  const aiProductLines = buildArticleViralBlueprintPromptLines("deepWriting", {
    articleTitle: "AI Agent 正在重做 SaaS 产品的工作流",
  }).join("\n");

  assert.match(careerLines, /职场转折型/);
  assert.match(careerLines, /组织规则.*角色分化/);
  assert.match(aiProductLines, /AI产品重排型/);
  assert.match(aiProductLines, /流程、成本、组织后果和边界/);
});

test("writing state maps high-value vertical blueprints to stronger article prototypes", () => {
  const moneyKernel = buildWritingStateKernel({
    title: "海外赚美金副业：普通人如何验证第一条联盟营销路径",
  });
  const careerKernel = buildWritingStateKernel({
    title: "裁员之后，职场人的安全感为什么突然失效",
  });
  const aiProductKernel = buildWritingStateKernel({
    title: "AI 产品正在把内容团队的工作流重排一遍",
  });

  assert.equal(moneyKernel.articlePrototype, "investigation");
  assert.match(moneyKernel.stateChecklist.join("\n"), /赚钱路径拆解型/);
  assert.equal(careerKernel.articlePrototype, "phenomenon_analysis");
  assert.match(careerKernel.stateChecklist.join("\n"), /职场转折型/);
  assert.equal(aiProductKernel.articlePrototype, "product_walkthrough");
  assert.match(aiProductKernel.stateChecklist.join("\n"), /AI产品重排型/);
});
