import assert from "node:assert/strict";
import test from "node:test";

import { buildExpressionExemplarGuide } from "../generation";

test("buildExpressionExemplarGuide exposes positive and negative expression exemplars", () => {
  const guide = buildExpressionExemplarGuide({
    title: "AI 写作 workflow 的判断成本",
    persona: {
      name: "判断型作者",
      summary: "先给判断，再拆原因。",
      identityTags: ["内容策略"],
      writingStyleTags: ["观点评论"],
      toneConstraints: ["克制"],
      audienceHints: ["内容团队负责人"],
    },
    humanSignals: {
      realSceneOrDialogue: "周三晚上 10 点，你盯着屏幕改第七版标题。",
    },
    writingStyleProfile: {
      name: "判断型 profile",
      summary: "先抛事实，再下判断。",
      toneKeywords: ["克制", "直接"],
      structurePatterns: ["先判断后拆解"],
      languageHabits: ["少解释，多判断"],
      openingPatterns: ["从具体代价切入"],
      endingPatterns: ["收回到判断边界"],
      doNotWrite: ["不要写成培训稿"],
      imitationPrompt: "先给判断，再给事实。",
      reusablePromptFragments: ["先抛出现象，再给判断。"],
      verbatimPhraseBanks: {
        judgementPhrases: ["我的判断是"],
        readerBridgePhrases: ["你真正会卡住的，不是工具，而是判断。"],
      },
      tabooPatterns: ["不要用首先其次最后硬分段"],
    },
  });

  assert.match(guide, /正例片段/);
  assert.match(guide, /先抛出现象，再给判断/);
  assert.match(guide, /我的判断是/);
  assert.match(guide, /反例片段/);
  assert.match(guide, /不要写成培训稿/);
  assert.match(guide, /不要把正文写回教程/);
});

test("buildExpressionExemplarGuide feeds explicit author feedback into runtime exemplars", () => {
  const guide = buildExpressionExemplarGuide({
    title: "AI 写作 workflow 的判断成本",
    persona: {
      name: "判断型作者",
      summary: "先给判断，再拆原因。",
      identityTags: ["内容策略"],
      writingStyleTags: ["观点评论"],
      toneConstraints: ["克制"],
      audienceHints: ["内容团队负责人"],
    },
    humanSignals: {
      realSceneOrDialogue: "周三晚上 10 点，你盯着屏幕改第七版标题。",
    },
    writingStyleProfile: {
      name: "判断型 profile",
      summary: "先抛事实，再下判断。",
      toneKeywords: ["克制", "直接"],
      structurePatterns: ["先判断后拆解"],
      languageHabits: ["少解释，多判断"],
      openingPatterns: ["背景铺垫"],
      endingPatterns: ["收回到判断边界"],
      doNotWrite: ["不要写成培训稿"],
      imitationPrompt: "先给判断，再给事实。",
      reusablePromptFragments: ["先抛出现象，再给判断。"],
      verbatimPhraseBanks: {
        judgementPhrases: ["我的判断是"],
        readerBridgePhrases: ["你真正会卡住的，不是工具，而是判断。"],
      },
      tabooPatterns: ["不要用首先其次最后硬分段"],
    },
    authorOutcomeFeedbackLedger: {
      sampleCount: 3,
      positiveSampleCount: 1,
      prototypeSignals: [],
      stateVariantSignals: [],
      creativeLensSignals: [],
      openingPatternSignals: [],
      sectionRhythmSignals: [],
      recommendations: {
        prototype: null,
        stateVariant: null,
        creativeLens: null,
        openingPattern: null,
        sectionRhythm: null,
      },
      effectiveWritingProfile: null,
      expressionFeedbackSummary: {
        feedbackSampleCount: 2,
        likeMeCount: 0,
        unlikeMeCount: 1,
        tooHardCount: 0,
        tooSoftCount: 0,
        tooTutorialCount: 1,
        tooCommentaryCount: 1,
      },
      updatedAt: new Date().toISOString(),
    },
  });

  assert.match(guide, /不要写成教程步骤、方法清单、培训稿/);
  assert.match(guide, /不要只停留在空泛评论/);
  assert.match(guide, /优先用判断句、场景推进和读者桥接推进/);
  assert.doesNotMatch(guide, /开头方式：背景铺垫/);
});

test("buildExpressionExemplarGuide still works without a style profile when feedback exists", () => {
  const guide = buildExpressionExemplarGuide({
    title: "没有文风资产时也要吃到反馈",
    authorOutcomeFeedbackLedger: {
      sampleCount: 2,
      positiveSampleCount: 1,
      prototypeSignals: [],
      stateVariantSignals: [],
      creativeLensSignals: [],
      openingPatternSignals: [],
      sectionRhythmSignals: [],
      recommendations: {
        prototype: null,
        stateVariant: null,
        creativeLens: null,
        openingPattern: null,
        sectionRhythm: null,
      },
      effectiveWritingProfile: null,
      expressionFeedbackSummary: {
        feedbackSampleCount: 2,
        likeMeCount: 1,
        unlikeMeCount: 0,
        tooHardCount: 0,
        tooSoftCount: 1,
        tooTutorialCount: 0,
        tooCommentaryCount: 0,
      },
      updatedAt: new Date().toISOString(),
    },
  });

  assert.match(guide, /优先延续作者自己更像样本的判断手势/);
  assert.match(guide, /结论要更早落地/);
});

test("buildExpressionExemplarGuide ranks exemplars by current topic audience and emotion", () => {
  const guide = buildExpressionExemplarGuide({
    title: "内容团队为什么总在 AI 写作工作流里返工",
    persona: {
      name: "内容策略作者",
      summary: "从团队协作成本切入。",
      identityTags: ["内容策略"],
      writingStyleTags: ["观点评论"],
      audienceHints: ["内容团队负责人"],
    },
    strategyCard: {
      targetReader: "内容团队负责人",
      coreAssertion: "AI 写作真正贵的不是工具，而是团队反复返工的判断成本。",
    },
    researchBrief: {
      coreQuestion: "内容团队如何降低 AI 写作返工成本",
      strategyWriteback: {
        targetReader: "内容团队负责人",
        coreAssertion: "返工成本来自判断链路断裂。",
      },
    },
    humanSignals: {
      feltMoment: "看到第七版还在改标题时会有点烦。",
      wantToComplain: "不是工具不够强，是判断没落到人身上。",
    },
    writingStyleProfile: {
      name: "团队成本 profile",
      summary: "从具体协作代价落判断。",
      toneKeywords: ["直接", "克制"],
      structurePatterns: ["先讲团队现场，再落判断"],
      languageHabits: ["少铺垫"],
      openingPatterns: ["从团队返工现场切入"],
      endingPatterns: ["回到判断成本"],
      doNotWrite: ["不要写成工具教程"],
      imitationPrompt: "先写现场，再给判断。",
      reusablePromptFragments: [
        "这件事要先从人的协作成本看。",
        "漂亮但泛用的句子不应该排在前面。",
      ],
      suitableTopics: ["AI 写作", "内容团队"],
      verbatimPhraseBanks: {
        judgementPhrases: ["真正贵的是返工背后的判断成本"],
        readerBridgePhrases: ["内容团队负责人真正会卡住的，是每一轮返工都没人敢拍板。"],
        emotionPhrases: ["第七版标题还在原地打转时，烦躁不是情绪，是成本信号。"],
      },
      tabooPatterns: ["不要先定义 AI 写作是什么"],
    },
  });

  assert.match(guide, /内容团队负责人真正会卡住的/);
  assert.match(guide, /第七版标题还在原地打转/);
  assert.match(guide, /读者桥接优先面向「内容团队负责人」/);
  assert.match(guide, /情绪手势优先贴近作者当前体感/);
  assert.doesNotMatch(guide, /漂亮但泛用的句子不应该排在前面/);
});

test("buildExpressionExemplarGuide consumes cross-article exemplar profile from ledger", () => {
  const guide = buildExpressionExemplarGuide({
    title: "内容团队的 AI 写作返工成本",
    strategyCard: {
      targetReader: "内容团队负责人",
      coreAssertion: "返工成本来自判断没人拍板。",
    },
    authorOutcomeFeedbackLedger: {
      sampleCount: 4,
      positiveSampleCount: 2,
      prototypeSignals: [],
      stateVariantSignals: [],
      creativeLensSignals: [],
      openingPatternSignals: [],
      sectionRhythmSignals: [],
      recommendations: {
        prototype: null,
        stateVariant: null,
        creativeLens: null,
        openingPattern: null,
        sectionRhythm: null,
      },
      effectiveWritingProfile: null,
      expressionFeedbackSummary: null,
      expressionExemplarProfile: {
        positiveExamples: [
          {
            key: "opening:第七版标题现场",
            kind: "opening",
            text: "先抛出第七版标题还没拍板的现场，再落到判断成本。",
            sampleCount: 2,
            score: 5,
            reason: "历史正向样本。",
          },
          {
            key: "voice:先落判断",
            kind: "voice",
            text: "先落判断，再补事实。",
            sampleCount: 2,
            score: 4,
            reason: "历史正向样本。",
          },
        ],
        negativeExamples: [
          {
            key: "opening:先定义 AI 写作",
            kind: "opening",
            text: "先定义 AI 写作是什么，再拆三步方法。",
            sampleCount: 1,
            score: 3,
            reason: "历史反向样本。",
          },
        ],
      },
      updatedAt: new Date().toISOString(),
    },
  });

  assert.match(guide, /历史正例（2 次）：先抛出第七版标题还没拍板/);
  assert.match(guide, /历史正例（2 次）：先落判断/);
  assert.match(guide, /历史反例：先定义 AI 写作是什么/);
});
