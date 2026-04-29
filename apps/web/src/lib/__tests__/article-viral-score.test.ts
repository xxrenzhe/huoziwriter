import assert from "node:assert/strict";
import test from "node:test";

import { evaluateArticleViralScore } from "../article-viral-score";

test("evaluateArticleViralScore blocks article without shareable structure", () => {
  const result = evaluateArticleViralScore({
    title: "Google 搜索广告里，最费预算的往往不是错词，而是看起来很准的词",
    markdownContent: [
      "# Google 搜索广告里，最费预算的往往不是错词，而是看起来很准的词",
      "",
      "一个账户最难受的时刻，通常不是买错了词，而是后台里那个看起来很准的词，点击不差，花费在走，线索表却越来越难看。",
      "",
      "关键词只是入口，质量得分只是诊断工具，预算浪费最常发生在把相关误当成值钱的时候。",
      "",
      "![配图](/generated-assets/tail.jpg)",
    ].join("\n"),
    threshold: 90,
  });

  assert.equal(result.passed, false);
  assert.ok(result.score < 90);
  assert.ok(result.blockers.some((item) => /滑屏结构|收藏转发|视觉/.test(item)));
});

test("evaluateArticleViralScore passes structured practical article", () => {
  const result = evaluateArticleViralScore({
    title: "Google 搜索广告里，最费预算的不是错词，而是看起来很准的词",
    markdownContent: [
      "# Google 搜索广告里，最费预算的不是错词，而是看起来很准的词",
      "",
      "一个账户最难受的时刻，通常不是买错了词，而是后台里那个看起来很准的词，点击不差，花费在走，线索表却越来越难看。复盘会开到一半，老板盯着预算，脸色已经不太对，销售盯着线索质量，投放还在解释相关性。真正让人发冷的，不是这个词还要不要加价，而是搜这个词的人到底准备行动没有？那种钱已经花出去、每个人又都能说出一点道理的尴尬，很多做账户的人都懂。我见过不少投手卡在这里，越解释越慌，心里一沉。",
      "",
      "## 先别看词准不准，先看这批人到哪一步",
      "",
      "匿名复盘里，桌上摊着搜索词报告、线索表和质量得分。一个词花了三轮预算，点击像答案，销售跟进却发现大多数人还在了解阶段，根本没准备采购。销售当场就说：“这批人问得很细，但不像今天会下单的人。”老板听完那句，脸色更沉了，因为预算已经烧掉，解释却还卡在半路。那一刻最难受的，不是没人干活，而是谁都在干活，结果还是对不上。",
      "",
      "<!-- huozi-visual:1 -->",
      "![搜索意图判断表](/generated-assets/intent.jpg)",
      "",
      "## 三列判断表，比质量得分更早救预算",
      "",
      "- 第一列：搜索词写的是什么，先标成了解、比较、行动。",
      "- 第二列：线索进入后销售问到什么，是预算、方案，还是只问概念。",
      "- 第三列：账户该怎么处理，继续投、缩预算、改落地页，还是加否词。",
      "",
      "## 质量得分只能体检，不能替你判断买不买",
      "",
      "质量得分从 1 到 10，能看预期点击率、广告相关性和落地页体验。它像体检表，不像收入表；它能提醒你像不像，却不能告诉你这批人会不会买。",
      "",
      "<!-- huozi-visual:2 -->",
      "![质量得分漫画](/generated-assets/quality.jpg)",
      "",
      "## 今天回后台，只做一个动作",
      "",
      "<!-- huozi-visual:3 -->",
      "![复盘动作卡](/generated-assets/action.jpg)",
      "",
      "- 把高花费搜索词重新按需求阶段分层。",
      "- 把每一层和销售反馈对齐。",
      "- 先处理看起来准但行动意图不够的词，再讨论加价。",
      "",
      "我更怕的，不是词不相关，而是团队已经把钱花出去了，还在拿质量得分给自己壮胆。别再先问词准不准了。先问这个搜索背后的人愿不愿意行动，再问你的账户接不接得住这笔钱。真把这一步重做一遍，很多人都会有点心里发凉，因为以前那些看起来最稳的词，往往就是最会偷预算的词。",
    ].join("\n"),
    threshold: 92,
  });

  assert.equal(result.passed, true);
  assert.ok(result.score >= 92);
});

test("evaluateArticleViralScore blocks structured but preachy article", () => {
  const result = evaluateArticleViralScore({
    title: "Google 搜索广告里，最费预算的不是错词，而是看起来很准的词",
    markdownContent: [
      "# Google 搜索广告里，最费预算的不是错词，而是看起来很准的词",
      "",
      "很多团队在搜索广告优化过程中，往往没有建立正确的判断顺序，因此会造成预算浪费。",
      "",
      "## 先理解问题",
      "",
      "你应该先理解搜索意图，再理解关键词和页面之间的关系。",
      "",
      "## 再建立方法",
      "",
      "第一步，整理关键词。第二步，分析页面。第三步，重新定义评估方式。",
      "",
      "## 最后执行动作",
      "",
      "- 把关键词分组。",
      "- 把页面重构。",
      "- 把流程优化。",
      "",
      "综上所述，更合理的做法是建立新的方法论。",
    ].join("\n"),
    threshold: 92,
  });

  assert.equal(result.passed, false);
  assert.ok(result.score < 92);
  assert.ok(result.blockers.some((item) => /情绪与共情|案例具体度|去说教程度|说教姿态/.test(item)));
});

test("evaluateArticleViralScore supports power-shift breaking business article mode", () => {
  const result = evaluateArticleViralScore({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    markdownContent: [
      "# 刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
      "",
      "刚刚，Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。这不是一条普通财报快讯，而是 AI 王座第一次在公开账本上换了人。赢家、输家、时间差，今天全摆在台面上了。硅谷不少人看到这个数字，第一反应不是兴奋，而是倒吸一口凉气：权力真的开始倾斜了。",
      "",
      "## 胜负先看数字，不用先听故事",
      "",
      "WSJ 披露的关键信号很简单：Anthropic 从 2025 年初约 10 亿 ARR，15 个月冲到 300 亿；OpenAI 当前年收入约 240 亿，但 1220 亿融资刚到账，6000 亿算力合同和更慢的盈利时间表已经压上来了。",
      "",
      "![营收与成本看板](/generated-assets/power-shift-board.jpg)",
      "",
      "## 赢的不只是营收，是路线",
      "",
      "Anthropic 赢在企业端。30 万家企业客户、1000 家年付超 100 万美元的大客户、财富十强里 8 家在用 Claude，这不是热闹流量，而是现金流和续约率。真正让 OpenAI 难受的，不只是被反超，而是它发现对手花得更少、回得更快，自己却还背着更重的算力账单往前冲。",
      "",
      "## 输家的伤口，已经从外部打到内部",
      "",
      "更狠的是，OpenAI 的伤不只在外部。WSJ 和 The Information 连着捅出内部裂痕：CFO 对算力账单担忧，CEO 还在推扩张，董事会和投资者开始重新看待这条路还跑不跑得通。表面上是营收差了 60 亿，背后却是内部已经有人开始担心，这条路会不会把公司直接拖进财务冰山。",
      "",
      "## 这为什么值得转发",
      "",
      "因为这篇文章讲的不是谁又融了一轮钱，而是 AI 商业化今天到底站在哪边：先做企业现金流，还是继续背着高成本去追免费周活。市场正在用真金白银投票，下半场会更狠。这种文章最适合转给关注 AI 商业化、企业市场和资本开支的人，因为它能一句话解释：为什么今天变天了。",
    ].join("\n"),
    threshold: 92,
  });

  assert.equal(result.passed, true);
  assert.ok(result.score >= 92);
});
