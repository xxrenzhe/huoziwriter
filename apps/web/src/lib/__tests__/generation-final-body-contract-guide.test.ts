import assert from "node:assert/strict";
import test from "node:test";

import { buildFinalBodyContractGuide } from "../generation";

test("buildFinalBodyContractGuide turns viral genome and research brief into concrete writing contract", () => {
  const guide = buildFinalBodyContractGuide({
    deepWritingPayload: {
      viralGenomePack: {
        firstScreenPromise: "前 200 字先写清账户里发生了什么、预算代价和角色冲突。",
        shareTrigger: "这篇最适合转给老板和销售，因为它能解释为什么词很准却不出单。",
        authorPostureMode: "case_breakdown",
        businessQuestions: [
          "钱具体从哪里来，或者成本具体卡在哪里？",
          "为什么这个变化是现在，不是去年？",
          "哪些人不适合照着做？",
        ],
      },
    },
    researchBrief: {
      businessQuestionAnswers: [
        { question: "成本卡在哪里", answer: "预算烧在看起来准但行动意图不够的词上。" },
        { question: "为什么是现在", answer: "点击越来越贵，误判代价被放大了。" },
        { question: "谁不适合", answer: "拿不到销售反馈的人先别照搬。" },
      ],
    },
  });

  assert.match(guide, /最终正文契约/);
  assert.match(guide, /第一屏契约：前 200 字先写清账户里发生了什么、预算代价和角色冲突/);
  assert.match(guide, /姿态契约：正文必须像在拆一个具体现场/);
  assert.match(guide, /案例契约：正文至少要有一个 mini case/);
  assert.match(guide, /情绪契约：正文至少要让读者看到一次谁在亏、谁在急、谁在解释不动/);
  assert.match(guide, /正文必须把钱从哪里来、成本卡在哪里或预算漏在哪里写实/);
  assert.match(guide, /正文必须把 why now 写进正文/);
  assert.match(guide, /正文必须写出不适合照搬的人、前提或边界/);
  assert.match(guide, /传播契约：这篇最适合转给老板和销售/);
});

test("buildFinalBodyContractGuide falls back to a hard first-screen contract without payload details", () => {
  const guide = buildFinalBodyContractGuide({
    deepWritingPayload: {},
    researchBrief: null,
  });

  assert.match(guide, /前 200 字必须同时出现具体对象、正在发生的变化和读者代价/);
  assert.match(guide, /不要站在上面讲课/);
});

test("buildFinalBodyContractGuide supports power-shift breaking article contract", () => {
  const guide = buildFinalBodyContractGuide({
    deepWritingPayload: {
      selectedTitle: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
      viralGenomePack: {
        mode: "power_shift_breaking",
        firstScreenPromise: "前 120 字必须同时出现赢家名字、输家名字、硬数字和今天到底变了什么。",
        shareTrigger: "这篇最适合转给关注 AI 商业化、企业市场和资本开支的人。",
        authorPostureMode: "analysis_interpreter",
        businessQuestions: [
          "钱具体从哪里来，或者成本具体卡在哪里？",
          "为什么这个变化是现在，不是去年？",
          "这个机会/问题影响的是哪一类人？",
          "一条最可信的案例或账本证据是什么？",
        ],
      },
    },
    researchBrief: {
      businessQuestionAnswers: [
        { question: "成本卡在哪里", answer: "企业收入、训练成本和算力账单一起拉开差距。" },
        { question: "为什么是现在", answer: "因为第一次出现了足够公开、足够刺眼的胜负数字。" },
        { question: "影响哪类人", answer: "关注 AI 商业化、算力资本开支和企业落地的人。" },
        { question: "可信证据", answer: "WSJ、The Information 和公开财务口径。" },
      ],
    },
  });

  assert.match(guide, /第一屏契约：前 120 字必须同时出现赢家名字、输家名字、硬数字和今天到底变了什么/);
  assert.match(guide, /姿态契约：正文必须像在拆一场王座更替或资本战/);
  assert.match(guide, /看板契约：正文至少要有一个胜负看板段落/);
  assert.match(guide, /情绪契约：正文至少要让读者看到一次谁在担忧、谁在掉队、哪张账单或哪道裂痕开始压人/);
  assert.match(guide, /传播契约：这篇最适合转给关注 AI 商业化、企业市场和资本开支的人/);
});
