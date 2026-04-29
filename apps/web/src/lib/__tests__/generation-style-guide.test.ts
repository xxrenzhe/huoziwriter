import assert from "node:assert/strict";
import test from "node:test";

import { buildWritingStyleGuide } from "../generation";

test("buildWritingStyleGuide keeps only high-confidence constraints for multi-sample profiles", () => {
  const guide = buildWritingStyleGuide({
    name: "交叉样本文风",
    summary: "来自多篇样本的稳定表达画像。",
    sampleCount: 3,
    confidenceProfile: {
      toneKeywords: 0.82,
      structurePatterns: 0.74,
      languageHabits: 0.48,
      openingPatterns: 0.57,
      endingPatterns: 0.44,
      sentenceRhythm: 0.71,
      sentenceLengthProfile: 0.78,
      paragraphBreathingPattern: 0.7,
      punctuationHabits: 0.52,
      tangentPatterns: 0.45,
      callbackPatterns: 0.39,
      statePresets: 0.54,
      antiOutlineRules: 0.42,
      verbatimPhraseBanks: 0.46,
    },
    toneKeywords: ["判断先行", "克制", "短句推进"],
    sentenceLengthProfile: "短句偏多，少量长句补解释。",
    paragraphBreathingPattern: "关键判断适合独立成段。",
    structurePatterns: ["先抛现象再给判断", "段内用结论句收束"],
    transitionPatterns: ["但", "问题是"],
    languageHabits: ["常用对照式判断"],
    openingPatterns: ["开头先抛现象或问题"],
    endingPatterns: ["结尾回到判断"],
    punctuationHabits: ["问句用于转向"],
    tangentPatterns: ["允许短暂类比后拉回主线"],
    callbackPatterns: ["前文判断在后文变体重现"],
    factDensity: "高",
    emotionalIntensity: "中",
    suitableTopics: ["科技与 AI"],
    reusablePromptFragments: ["先抛出现象，再给判断。"],
    verbatimPhraseBanks: {
      transitionPhrases: ["但", "问题是"],
      judgementPhrases: ["我更倾向于"],
      selfDisclosurePhrases: ["我自己的感觉是"],
      emotionPhrases: ["真的会愣一下"],
      readerBridgePhrases: ["很多读者会卡在这里"],
    },
    tabooPatterns: ["不要写成编号提纲"],
    statePresets: ["像刚想明白一件事"],
    antiOutlineRules: ["不要强行先讲背景再讲结论"],
    doNotWrite: ["不要照抄样本句子"],
    imitationPrompt: "请参考这组样本的稳定共性来写。",
  });

  assert.match(guide, /稳定度说明：该资产来自 3 篇样本交叉聚合/);
  assert.match(guide, /语气关键词：判断先行、克制、短句推进/);
  assert.match(guide, /结构习惯：先抛现象再给判断；段内用结论句收束/);
  assert.match(guide, /句长分布：短句偏多，少量长句补解释。/);
  assert.match(guide, /弱参考维度：.*开头习惯：开头先抛现象或问题/);
  assert.match(guide, /弱参考维度：.*标点习惯：问句用于转向/);
  assert.doesNotMatch(guide, /语言习惯：常用对照式判断/);
  assert.doesNotMatch(guide, /逐字转场短语：但 \/ 问题是/);
  assert.doesNotMatch(guide, /回环方式：前文判断在后文变体重现/);
});

test("buildWritingStyleGuide preserves full guidance when no confidence profile exists", () => {
  const guide = buildWritingStyleGuide({
    name: "单篇样本文风",
    summary: "单篇分析结果。",
    toneKeywords: ["判断先行"],
    sentenceLengthProfile: "短句偏多。",
    paragraphBreathingPattern: "关键判断独立成段。",
    structurePatterns: ["先抛事实再给判断"],
    transitionPatterns: ["但"],
    languageHabits: ["常用对照式判断"],
    openingPatterns: ["先抛问题"],
    endingPatterns: ["结尾收回判断"],
    punctuationHabits: ["问句转向"],
    tangentPatterns: ["短暂类比后拉回主线"],
    callbackPatterns: ["前后回扣"],
    factDensity: "高",
    emotionalIntensity: "中",
    suitableTopics: ["科技与 AI"],
    reusablePromptFragments: ["先抛事实，再给判断。"],
    verbatimPhraseBanks: {
      transitionPhrases: ["但"],
      judgementPhrases: ["我更倾向于"],
      selfDisclosurePhrases: ["我自己的感觉是"],
      emotionPhrases: ["真的会愣一下"],
      readerBridgePhrases: ["很多读者会卡在这里"],
    },
    tabooPatterns: ["不要写成编号提纲"],
    statePresets: ["像刚想明白一件事"],
    antiOutlineRules: ["不要强行先讲背景再讲结论"],
    doNotWrite: ["不要照抄样本句子"],
    imitationPrompt: "请吸收节奏，不要照抄。",
  });

  assert.doesNotMatch(guide, /稳定度说明：/);
  assert.match(guide, /语言习惯：常用对照式判断/);
  assert.match(guide, /逐字转场短语：但/);
  assert.match(guide, /回环方式：前后回扣/);
});
