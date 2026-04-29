import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAiNoise } from "../ai-noise-scan";
import { polishMarkdownLocallyForReadability } from "../article-stage-apply";

test("polishMarkdownLocallyForReadability splits long sentences without touching headings", () => {
  const markdown = [
    "# 文章标题",
    "",
    "通过完整流程自动化，系统可以把素材输入、选题判断、受众分析、深度写作、事实核查、视觉规划、排版发布这些动作串起来，但如果每一步都重新理解上下文，终稿阶段还是会回到人工补洞。",
  ].join("\n");
  const polished = polishMarkdownLocallyForReadability(markdown);
  assert.match(polished, /^# 文章标题/m);
  assert.match(polished, /完整流程自动化/);
  assert.match(polished, /\n系统可以把素材输入/);
  assert.doesNotMatch(polished, /^通过完整流程自动化/m);
  assert.equal(analyzeAiNoise(polished).longSentenceCount < analyzeAiNoise(markdown).longSentenceCount, true);
});

test("polishMarkdownLocallyForReadability reduces didactic command phrasing", () => {
  const markdown = [
    "# 文章标题",
    "",
    "真正该看的不是关键词，而是意图有没有被接住。最该先问的问题是用户到了哪一步。先判断账户接住的是哪一段意图，再决定词、页、否词和出价怎么改。",
  ].join("\n");
  const polished = polishMarkdownLocallyForReadability(markdown);

  assert.doesNotMatch(polished, /真正该看的/);
  assert.doesNotMatch(polished, /最该先问/);
  assert.doesNotMatch(polished, /先判断.+再决定/);
  assert.equal(analyzeAiNoise(polished).didacticCueCount < analyzeAiNoise(markdown).didacticCueCount, true);
});
