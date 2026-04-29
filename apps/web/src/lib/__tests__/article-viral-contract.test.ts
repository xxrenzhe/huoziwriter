import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFinalBodyViralContract } from "../article-viral-contract";

test("final body contract blocks article that only completes upstream fields", () => {
  const result = evaluateFinalBodyViralContract({
    title: "搜索广告最费预算的，不是错词，而是看起来很准的词",
    authorPostureMode: "case_breakdown",
    businessQuestions: [
      "这篇文章里，谁在赚钱/亏钱/降本/抢时间？",
      "钱具体从哪里来，或者成本具体卡在哪里？",
      "为什么这个变化是现在，不是去年？",
      "这个机会/问题影响的是哪一类人？",
      "哪些人不适合照着做？",
      "一条最可信的案例或账本证据是什么？",
      "读者读完后最可能转发给谁，为什么？",
    ],
    businessQuestionAnswers: [
      { question: "谁在赚钱/亏钱", answer: "搜索广告团队正在承受预算浪费。" },
      { question: "成本卡在哪里", answer: "词面相关被误判成商业价值。" },
      { question: "为什么现在", answer: "流量更贵了，错误判断更疼。" },
      { question: "影响哪类人", answer: "投放、销售和老板都会被影响。" },
      { question: "谁不适合", answer: "没有销售反馈闭环的团队别照搬。" },
      { question: "可信证据", answer: "搜索词报告、线索表和销售反馈。" },
      { question: "转给谁", answer: "适合转给老板和销售。" },
    ],
    firstScreenPromise: "前 200 字先交代账户里正在发生的误判、预算代价和角色冲突。",
    markdownContent: [
      "# 搜索广告最费预算的，不是错词，而是看起来很准的词",
      "",
      "很多团队在搜索广告优化过程中，容易出现认知偏差，因此需要建立更完整的方法论。",
      "",
      "## 先理解问题",
      "",
      "我们应该从更高的视角理解关键词、搜索意图和页面之间的关系。",
      "",
      "## 再建立框架",
      "",
      "第一步，梳理关键词。第二步，理解页面。第三步，建立新的评估体系。",
      "",
      "## 最后执行",
      "",
      "综上所述，更合理的做法是重建判断模型。",
    ].join("\n"),
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.some((item) => /第一屏/.test(item)));
  assert.ok(result.blockers.some((item) => /mini case|具体小案例|虚焦/.test(item)));
  assert.ok(result.blockers.some((item) => /商业七问|商业问题/.test(item)));
});

test("final body contract passes article that兑现 scene conflict, case, empathy and business questions", () => {
  const result = evaluateFinalBodyViralContract({
    title: "搜索广告最费预算的，不是错词，而是看起来很准的词",
    authorPostureMode: "case_breakdown",
    businessQuestions: [
      "钱具体从哪里来，或者成本具体卡在哪里？",
      "为什么这个变化是现在，不是去年？",
      "这个机会/问题影响的是哪一类人？",
      "哪些人不适合照着做？",
      "一条最可信的案例或账本证据是什么？",
    ],
    businessQuestionAnswers: [
      { question: "成本卡在哪里", answer: "预算烧在看起来准但不会下单的词上。" },
      { question: "为什么现在", answer: "今年点击更贵，误判的代价更直接。" },
      { question: "影响哪类人", answer: "老板、销售和投放都会被拖进复盘会。" },
      { question: "谁不适合", answer: "没有销售反馈的人先别照搬。" },
      { question: "可信证据", answer: "搜索词报告、线索表、销售原话。" },
    ],
    firstScreenPromise: "第一屏先把账户误判、预算压力和角色冲突抛出来。",
    markdownContent: [
      "# 搜索广告最费预算的，不是错词，而是看起来很准的词",
      "",
      "最难受的不是买错词，而是后台里那个看起来很准的词，点击还行，预算也在烧，线索表却越来越难看。复盘会刚开十分钟，老板盯着花费，销售盯着线索质量，投放还在解释相关性。真正让人发冷的，不是“这个词要不要加价”，而是另一句：搜这个词的人，到底准备下单没有？",
      "",
      "## 复盘会最刺耳的，不是贵，而是解释不动",
      "",
      "那天桌上摊着搜索词报告、线索表和销售跟进表。一个词已经跑了 3 周，点击不差，花费却快把这组预算吃完。销售当场说：“这批人问得很细，但不像这周会下单的人。” 老板听完脸色就沉了，因为钱已经花出去，解释却还卡在“词很相关”这一步。",
      "",
      "## 钱不是花在错词上，是花在阶段判断错位上",
      "",
      "这就是为什么今年更疼。点击更贵了，线索更慢了，之前还能靠便宜流量扛过去的误判，现在会直接把成本打回老板脸上。真正受影响的不是一个投手，而是老板、销售、投放三个人一起被拖进一场解释不动的复盘。",
      "",
      "## 先别照搬，没销售反馈的人会更容易误判",
      "",
      "如果你的团队拿不到销售原话，先别急着照搬这套分层。因为你看得见搜索词，看不见成交前最后那一下犹豫，最后还是会把“相关”误当成“值钱”。",
      "",
      "## 我会先回后台看这三样",
      "",
      "- 搜索词报告：把高花费词按了解、比较、行动分层。",
      "- 线索表：看销售到底被什么问题卡住。",
      "- 销售原话：把“问得细但不下单”的词先单独圈出来。",
      "",
      "今天最值得转给老板和销售的，不是一个新方法，而是一句老实话：预算最容易漏掉的地方，往往就是那个看起来最准、却最不想买的人。",
    ].join("\n"),
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockers.length, 0);
});

test("final body contract supports power-shift breaking article mode", () => {
  const result = evaluateFinalBodyViralContract({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    authorPostureMode: "analysis_interpreter",
    businessQuestions: [
      "钱具体从哪里来，或者成本具体卡在哪里？",
      "为什么这个变化是现在，不是去年？",
      "这个机会/问题影响的是哪一类人？",
      "一条最可信的案例或账本证据是什么？",
      "读者读完后最可能转发给谁，为什么？",
    ],
    businessQuestionAnswers: [
      { question: "成本卡在哪里", answer: "Anthropic 的企业收入和更低训练成本正在一起扩大差距。" },
      { question: "为什么是现在", answer: "因为 300 亿对 240 亿，第一次把王座更替写进了公开数字。" },
      { question: "影响哪类人", answer: "所有关注 AI 商业化、算力资本开支和企业落地的人。" },
      { question: "可信证据", answer: "WSJ、The Information 和公开财务口径。" },
      { question: "转发给谁", answer: "适合转给关注 AI 商业化和企业市场的人。" },
    ],
    firstScreenPromise: "前 120 字必须同时出现赢家名字、输家名字、硬数字和今天到底变了什么。",
    markdownContent: [
      "# 刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
      "",
      "刚刚，Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。这不是一条普通财报快讯，而是 AI 王座第一次在公开账本上换了人。赢家、输家、时间差，今天全摆在台面上了。硅谷不少人看到这个数字，第一反应不是兴奋，而是倒吸一口凉气：权力真的开始倾斜了。",
      "",
      "## 胜负先看数字，不用先听故事",
      "",
      "WSJ 披露的关键信号很简单：Anthropic 从 2025 年初约 10 亿 ARR，15 个月冲到 300 亿；OpenAI 当前年收入约 240 亿，但 1220 亿融资刚到账，6000 亿算力合同和更慢的盈利时间表已经压上来了。",
      "",
      "## 赢的不只是营收，是路线",
      "",
      "Anthropic 赢在企业端。30 万家企业客户、1000 家年付超 100 万美元的大客户、财富十强里 8 家在用 Claude，这不是热闹流量，而是现金流和续约率。真正让 OpenAI 难受的，不只是被反超，而是它发现对手花得更少、回得更快，自己却还背着更重的算力账单往前冲。",
      "",
      "## 输家的伤口，已经从外部打到内部",
      "",
      "更狠的是，OpenAI 的伤不只在外部。WSJ 和 The Information 连着捅出内部裂痕：CFO 对算力账单担忧，CEO 还在推扩张，董事会和投资者开始重新看待这条路还跑不跑得通。表面上是营收差了 60 亿，背后却是内部已经有人开始担心，这条路会不会把公司直接拖进财务冰山。",
      "",
      "## 为什么现在一定会被转发",
      "",
      "因为这篇文章讲的不是谁又融了一轮钱，而是 AI 商业化今天到底站在哪边：先做企业现金流，还是继续背着高成本去追免费周活。市场正在用真金白银投票，这篇很适合转给关注 AI 商业化和企业市场的人，因为它能一句话解释：为什么今天变天了。",
    ].join("\n"),
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockers.length, 0);
});
