import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase } from "../db";
import { buildCommandRewrite, buildGeneratedArticleDraft, buildProsePolishTargetedRewrite } from "../generation";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-generation-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;

  process.env.DATABASE_PATH = tempDbPath;
  process.env.OPENAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousOpenAiApiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    if (previousAnthropicApiKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey;
    if (previousGeminiApiKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiApiKey;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("buildGeneratedArticleDraft fallback never exposes internal prompts", async () => {
  await withTempDatabase("fallback-clean-copy", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "AI 时代，普通人如何把焦虑变成可执行的下一步",
      fragments: ["这是第二条用于验证 worker 自动编译的测试碎片", "把焦虑拆成具体工作环节", "先做一个今天能验证的小实验"],
      bannedWords: [],
      outlineNodes: [
        { title: "痛点引入", description: "焦虑来自旧判断失效" },
        { title: "行动建议", description: "把变化压成小实验" },
      ],
    });

    assert.match(result.markdown, /^# AI 时代，普通人如何把焦虑变成可执行的下一步/);
    assert.match(result.markdown, /## 痛点引入/);
    assert.match(result.markdown, /今天能不能验证一个小假设/);
    assert.doesNotMatch(result.markdown, /测试碎片|worker 自动编译/);
    assert.doesNotMatch(result.markdown, /你是中文专栏作者/);
    assert.doesNotMatch(result.markdown, /请基于以下事实素材/);
    assert.doesNotMatch(result.markdown, /当前默认作者人设|当前稿件大纲锚点/);
    assert.doesNotMatch(result.markdown, /system|prompt|cacheable/i);
  });
});

test("buildGeneratedArticleDraft keeps selected opening as first reader-facing paragraph", async () => {
  await withTempDatabase("fallback-opening-lead", async () => {
    const opening = "词很精准，质量分也不差，预算还能跑，结果就是不出单。";
    const result = await buildGeneratedArticleDraft({
      title: "Google Ads 里精准词为什么不赚钱",
      fragments: ["关键词只能说明用户说了什么，搜索意图才更接近他愿不愿意行动。"],
      bannedWords: [],
      deepWritingPayload: {
        openingStrategy: opening,
      },
    });

    assert.match(result.markdown, /^# Google Ads 里精准词为什么不赚钱/);
    assert.equal(result.markdown.split(/\n{2,}/)[1], opening);
  });
});

test("buildGeneratedArticleDraft fallback uses deepWriting payload to avoid tutorial tone", async () => {
  await withTempDatabase("fallback-deepwriting-tone", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "为什么团队写得越来越快，发得却越来越慢",
      fragments: [
        "真正卡住流程的，不是写作速度，而是事实、判断和发布之间的断点。",
        "同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。",
      ],
      bannedWords: [],
      deepWritingPayload: {
        selectedTitle: "为什么团队写得越来越快，发得却越来越慢",
        centralThesis: "写作提速之后，真正拖慢流程的是核查、判断和发布收口。",
        openingStrategy: "文档越写越快，稿子却还是卡在发布前一晚。",
        organicGrowthKernel: {
          readerConflict: "读者看到的是效率提升，实际承受的是终稿前反复返工的代价。",
          materialSpark: "同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。",
          authorLens: "作者盯住的是写作提速之后，责任没有同步前移的那段断点。",
          growthPath: [
            "先让读者看见返工代价。",
            "再把错位从现象层推进到流程层。",
            "最后收成一句能被转发的判断。",
          ],
        },
        sectionBlueprint: [
          {
            heading: "返工不是偶然",
            goal: "真正先出现的是代价，不是方法论缺口",
            paragraphMission: "读者最先感受到的，是终稿前反复返工的失控感",
            evidenceHints: ["同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。"],
          },
          {
            heading: "断点在后半程",
            goal: "写快了，不等于判断已经前移",
            paragraphMission: "流程真正变慢的地方，在核查、判断和发布收口",
            evidenceHints: ["真正卡住流程的，不是写作速度，而是事实、判断和发布之间的断点。"],
          },
          {
            heading: "最后留下的判断",
            goal: "真正需要前移的是责任，而不是更多提示词",
            paragraphMission: "文章最后只收成一句判断，不把全文写成步骤清单",
          },
        ],
      },
    });

    assert.match(result.markdown, /^# 为什么团队写得越来越快，发得却越来越慢/);
    assert.equal(result.markdown.split(/\n{2,}/)[1], "文档越写越快，稿子却还是卡在发布前一晚。");
    assert.match(result.markdown, /## 返工不是偶然/);
    assert.match(result.markdown, /## 断点在后半程/);
    assert.doesNotMatch(result.markdown, /先不要急着追所有新东西/);
    assert.doesNotMatch(result.markdown, /把下一步压到足够小/);
    assert.doesNotMatch(result.markdown, /今天能不能验证一个小假设/);
  });
});

test("buildCommandRewrite fallback uses deepWriting payload when current draft is empty", async () => {
  await withTempDatabase("command-rewrite-deepwriting-fallback", async () => {
    const result = await buildCommandRewrite({
      title: "谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
      markdownContent: "",
      fragments: [
        "一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。",
        "关键词表面相近，但用户搜索意图不同，导致流量价值和搜索结果不同。",
      ],
      bannedWords: [],
      command: "请额外吸收 deepWriting 阶段改写指令，输出完整 Markdown 正文。",
      deepWritingPayload: {
        selectedTitle: "谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
        centralThesis: "搜索广告里真正昂贵的错，不是买错关键词，而是没有识别关键词背后的行动意图。",
        openingStrategy: "一个词看起来很精准，质量分也不差，预算还能跑，结果就是不出单。",
        organicGrowthKernel: {
          readerConflict: "读者以为自己买错关键词，实际上一直在为错误意图付费。",
          materialSpark: "一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。",
          authorLens: "作者盯住的是流量计费和真实需求之间的错位。",
          growthPath: [
            "先让读者看见付费流量里的误判代价。",
            "再把关键词和搜索意图的错位说清楚。",
            "最后收成一句能带走的判断。",
          ],
        },
        sectionBlueprint: [
          {
            heading: "精准词为什么会浪费钱",
            paragraphMission: "从付费流量里的误判代价切入",
            evidenceHints: ["一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。"],
          },
          {
            heading: "真正的变量是搜索意图",
            paragraphMission: "把关键词和搜索意图的错位说清楚",
            evidenceHints: ["关键词表面相近，但用户搜索意图不同，导致流量价值和搜索结果不同。"],
          },
          {
            heading: "最后看行动意图",
            paragraphMission: "收成一句可转发判断，不写成操作清单",
          },
        ],
      },
    });

    assert.equal(result.markdown.split(/\n{2,}/)[1], "一个词看起来很精准，质量分也不差，预算还能跑，结果就是不出单。");
    assert.match(result.markdown, /## 精准词为什么会浪费钱/);
    assert.match(result.markdown, /## 真正的变量是搜索意图/);
    assert.doesNotMatch(result.markdown, /AI 内容生产|Prompt|生产线|今天能不能验证一个小假设/);
  });
});

test("deepWriting fallback does not expose execution-card headings or didactic section instructions", async () => {
  await withTempDatabase("deepwriting-reader-facing-sections", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
      fragments: ["关键词表面相近，但用户搜索意图不同，导致流量价值和搜索结果不同。"],
      bannedWords: [],
      deepWritingPayload: {
        selectedTitle: "谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
        centralThesis: "搜索广告里真正昂贵的错，不是买错关键词，而是没有识别关键词背后的行动意图。",
        openingStrategy: "很多账户最贵的浪费，不是买错关键词，而是把正在了解的人当成马上要买的人。",
        organicGrowthKernel: {
          readerConflict: "读者以为自己买错关键词，实际上一直在为错误意图付费。",
          materialSpark: "一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。",
          authorLens: "作者盯住的是流量计费和真实需求之间的错位。",
          growthPath: ["先让读者看见代价。", "再解释意图错位。", "最后收成判断。"],
        },
        sectionBlueprint: [
          { heading: "痛点引入", paragraphMission: "先给出判断，再放事实。", evidenceHints: ["一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。"] },
          { heading: "核心反转", paragraphMission: "这一节承担的是逐层加码。", evidenceHints: ["关键词表面相近，但用户搜索意图不同，导致流量价值和搜索结果不同。"] },
          { heading: "行动建议", paragraphMission: "再让素材火花和核心判断互相咬合。", evidenceHints: ["作者可以从一个匿名复盘场景切入。"] },
        ],
        mustUseFacts: ["补官方源，明确最基础的事实口径。", "关键词表面相近，但用户搜索意图不同。"],
      },
    });

    assert.match(result.markdown, /## 精准词为什么也会浪费钱/);
    assert.match(result.markdown, /## 真正的变量不是词面/);
    assert.doesNotMatch(result.markdown, /痛点引入|核心反转|行动建议|先给出判断|这一节承担|素材火花|逐层加码|作者可以|匿名复盘|补官方源|人设视角/);
  });
});

test("buildProsePolishTargetedRewrite fallback preserves deepWriting opening over stale generic lead", async () => {
  await withTempDatabase("prose-polish-preserves-opening", async () => {
    const opening = "很多账户最贵的浪费，不是买错关键词，而是把正在了解的人当成马上要买的人。";
    const result = await buildProsePolishTargetedRewrite({
      title: "谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
      markdownContent: [
        "# 谷歌搜索意图的本质：真正拖住结果的，不是表面这一步",
        "词面越精准，这个误判有时越隐蔽。",
        "## 精准词为什么会浪费钱",
        "一些看起来精准的关键词长期不赚钱，一些看起来普通的关键词却能稳定出单。",
      ].join("\n\n"),
      fragments: ["关键词表面相近，但用户搜索意图不同，导致流量价值和搜索结果不同。"],
      bannedWords: [],
      rewrittenLead: [
        "真正拖慢内容生产的，往往不是某一句提示词，而是素材、核查、排版和发布之间的断点。",
        "只要终稿前还要反复补证据、改结构、查风险，这套流程就还没有形成生产线。",
      ].join("\n\n"),
      issues: [{ type: "开头抓力不足", example: "词面越精准，这个误判有时越隐蔽。", suggestion: "保留已选强开头。" }],
      deepWritingPayload: {
        openingStrategy: opening,
      },
    });

    assert.match(result.markdown, /^# 谷歌搜索意图的本质/);
    assert.equal(result.markdown.split(/\n{2,}/)[1], opening);
    assert.doesNotMatch(result.markdown, /内容生产|提示词|生产线/);
  });
});

test("buildGeneratedArticleDraft ignores execution-note openingStrategy", async () => {
  await withTempDatabase("fallback-ignore-opening-instruction", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "搜索意图比关键词更决定流量价值",
      fragments: ["看起来精准的词不赚钱，看起来普通的词却能稳定出单。"],
      bannedWords: [],
      deepWritingPayload: {
        selectedTitle: "搜索意图比关键词更决定流量价值",
        openingStrategy: "沿用已确认开头策略：用匿名复盘现场起手，先让读者看见最熟悉的误判。",
        centralThesis: "关键词字面仍是入口，但真正决定流量价值的是搜索意图。",
        organicGrowthKernel: {
          materialSpark: "看起来精准的词不赚钱，看起来普通的词却能稳定出单。",
        },
        sectionBlueprint: [{ heading: "真正的变量不是词面", paragraphMission: "词面相近只说明用户说法接近。" }],
      },
    });

    assert.doesNotMatch(result.markdown.split(/\n{2,}/)[1] || "", /沿用已确认开头策略|用匿名复盘现场起手/);
  });
});

test("buildGeneratedArticleDraft fallback keeps power-shift articles in scoreboard mode", async () => {
  await withTempDatabase("fallback-power-shift-mode", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
      fragments: [
        "Anthropic 年化营收来到 300 亿美元，OpenAI 当前年收入约 240 亿美元。",
        "企业客户、训练成本和算力账单一起决定这场胜负。",
      ],
      bannedWords: [],
      deepWritingPayload: {
        selectedTitle: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
        openingStrategy: "刚刚，Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。这不是普通财报更新，而是 AI 王座第一次在公开账本上换了人。",
        centralThesis: "这场反超真正改写的，不只是热度，而是企业收入、成本结构和行业话语权。",
        viralGenomePack: {
          mode: "power_shift_breaking",
          firstScreenPromise: "前 120 字必须同时出现赢家名字、输家名字、硬数字和今天到底变了什么。",
          shareTrigger: "这篇最适合转给关注 AI 商业化、企业市场和资本开支的人。",
        },
        sectionBlueprint: [
          { heading: "胜负先看数字", paragraphMission: "先把赢家、输家和硬数字摆上桌。" },
          { heading: "赢者为什么赢", paragraphMission: "写清收入结构、企业客户和成本效率。" },
          { heading: "输家哪里失血", paragraphMission: "把路线分歧、账单压力和内部裂痕写出来。" },
        ],
      },
    });

    assert.match(result.markdown, /^# 刚刚，美国AI霸主换了/);
    assert.equal(result.markdown.split(/\n{2,}/)[1], "刚刚，Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。这不是普通财报更新，而是 AI 王座第一次在公开账本上换了人。");
    assert.match(result.markdown, /## 胜负先看数字/);
    assert.match(result.markdown, /## 赢者为什么赢/);
    assert.match(result.markdown, /## 输家哪里失血/);
    assert.doesNotMatch(result.markdown, /今天能不能验证一个小假设|回后台执行|操作手册/);
  });
});
